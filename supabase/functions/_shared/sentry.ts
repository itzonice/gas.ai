import * as Sentry from "@sentry/deno";
import { appEnvSchema } from "@studypulse/core/env/index.ts";
import { scrubEvent, sentryBaseOptions } from "@studypulse/core/observability/index.ts";

// Initialized once per isolate. Default integrations are off because one isolate
// serves many requests and the global handlers would mix their scopes together.
const dsn = Deno.env.get("SENTRY_DSN") || undefined;
Sentry.init({
  ...sentryBaseOptions(dsn, appEnvSchema.catch("development").parse(Deno.env.get("APP_ENV"))),
  defaultIntegrations: false,
  beforeSend: scrubEvent,
});
Sentry.setTag("region", Deno.env.get("SB_REGION") ?? "local");
Sentry.setTag("execution_id", Deno.env.get("SB_EXECUTION_ID") ?? "local");

export type Handler = (req: Request) => Response | Promise<Response>;

/**
 * Wraps an edge function handler: uncaught errors are reported to Sentry (tagged
 * with the function name) and turned into a generic 500 so no internals leak.
 */
export function withSentry(functionName: string, handler: Handler): Handler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (error) {
      Sentry.withScope((scope) => {
        scope.setTag("function", functionName);
        scope.setContext("request", { method: req.method, path: new URL(req.url).pathname });
        Sentry.captureException(error);
      });
      await Sentry.flush(2000);
      return Response.json({ error: "internal_error" }, { status: 500 });
    }
  };
}

export { Sentry };
