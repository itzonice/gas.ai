import {
  createLogger,
  REQUEST_ID_HEADER,
  resolveRequestId,
  type Logger,
} from "@studypulse/core/observability/index.ts";

import { circuitOpenCause } from "@studypulse/core/resilience/index.ts";

import { corsHeaders } from "./cors.ts";
import { HttpError } from "./http.ts";
import { Sentry } from "./sentry.ts";

export interface RequestContext {
  requestId: string;
  log: Logger;
}

export type ContextHandler = (req: Request, ctx: RequestContext) => Response | Promise<Response>;

/**
 * Standard edge function entry point. For each request it:
 * - reuses a safe incoming x-request-id or generates one, and echoes it on the response
 * - gives the handler a logger that stamps every line with the request id and function
 * - logs completion with status and duration
 * - reports uncaught errors to Sentry (tagged with the request id) and returns a
 *   generic 500 that includes the request id so support can find the logs
 *
 * Usage: `Deno.serve(createHandler("upload-syllabus", async (req, { log }) => { ... }))`
 */
export function createHandler(functionName: string, handler: ContextHandler) {
  return async (req: Request): Promise<Response> => {
    const requestId = resolveRequestId(req.headers);
    const log = createLogger({ requestId, fields: { fn: functionName } });
    const started = performance.now();
    const path = new URL(req.url).pathname;

    let response: Response;
    try {
      response =
        req.method === "OPTIONS"
          ? new Response(null, { status: 204 })
          : await handler(req, { requestId, log });
    } catch (error) {
      if (error instanceof HttpError) {
        log.info("request rejected", { status: error.status, code: error.code });
        response = Response.json(
          {
            error: error.code,
            message: error.message,
            details: error.details,
            request_id: requestId,
          },
          { status: error.status },
        );
      } else if (circuitOpenCause(error)) {
        // A provider is paused after repeated failures (S9): expected, not a bug to report.
        const open = circuitOpenCause(error)!;
        log.warn("provider paused", { provider: open.provider, path });
        response = Response.json(
          {
            error: "provider_unavailable",
            message: "This feature is temporarily unavailable. Please try again in a few minutes.",
            request_id: requestId,
          },
          { status: 503, headers: { "Retry-After": String(open.retryAfterSeconds()) } },
        );
      } else {
        log.error("unhandled error", { error, method: req.method, path });
        Sentry.withScope((scope) => {
          scope.setTag("function", functionName);
          scope.setTag("request_id", requestId);
          scope.setContext("request", { method: req.method, path });
          Sentry.captureException(error);
        });
        await Sentry.flush(2000);
        response = Response.json(
          { error: "internal_error", request_id: requestId },
          { status: 500 },
        );
      }
    }

    // Some responses (e.g. from fetch) have immutable headers; copy if needed.
    const extraHeaders = { ...corsHeaders, [REQUEST_ID_HEADER]: requestId };
    try {
      for (const [k, v] of Object.entries(extraHeaders)) response.headers.set(k, v);
    } catch {
      response = new Response(response.body, response);
      for (const [k, v] of Object.entries(extraHeaders)) response.headers.set(k, v);
    }

    log.info("request completed", {
      method: req.method,
      path,
      status: response.status,
      duration_ms: Math.round(performance.now() - started),
    });
    return response;
  };
}
