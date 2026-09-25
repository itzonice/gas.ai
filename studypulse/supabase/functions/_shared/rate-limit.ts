// Per-IP and per-user rate limits for every edge function (launch safety S10).
//
// createHandler checks the IP limit before the function runs; requireUser checks the user
// limit once the token is verified (so a forged token can't use up someone else's
// allowance). Over the limit: 429 with Retry-After. Counters live in Postgres
// (public.rate_limit_hit), so every worker shares them. If the counter can't be reached
// the request is allowed and a warning is logged: a database blip shouldn't take the app
// down, and the database has its own protections.
import { AsyncLocalStorage } from "node:async_hooks";
import { encodeHex } from "jsr:@std/encoding@^1/hex";
import type { Logger } from "@studypulse/core/observability/index.ts";
import { z } from "zod";

import { HttpError } from "./http.ts";
import { adminClient } from "./supabase.ts";

export interface Limit {
  limit: number;
  windowSeconds: number;
}
export interface FunctionLimits {
  ip: Limit;
  /** Null for functions no user calls (cron jobs, webhooks, public pages). */
  user: Limit | null;
}

const perMinute = (limit: number): Limit => ({ limit, windowSeconds: 60 });
const perHour = (limit: number): Limit => ({ limit, windowSeconds: 3600 });

const USER_DEFAULT = perMinute(60);
const IP_DEFAULT = perMinute(120);
/** Cron jobs and signed webhooks: the secret or signature is the gate; this caps floods. */
const MACHINE = { ip: perMinute(600), user: null };

/**
 * Every edge function's limits. A test fails if a function is missing here, so a new
 * function can't ship without them.
 */
export const FUNCTION_LIMITS: Record<string, FunctionLimits> = {
  "upload-syllabus": { ip: perMinute(30), user: perMinute(10) },
  "generate-cards": { ip: perMinute(30), user: perMinute(10) },
  "plan-study": { ip: IP_DEFAULT, user: perMinute(20) },
  "export-data": { ip: perMinute(20), user: perHour(10) },
  "export-cards": { ip: IP_DEFAULT, user: perMinute(20) },
  "delete-account": { ip: perMinute(10), user: perHour(5) },
  "stripe-checkout": { ip: perMinute(30), user: perMinute(10) },
  "stripe-portal": { ip: perMinute(30), user: perMinute(10) },
  "google-oauth": { ip: perMinute(30), user: perMinute(20) },
  "canvas-oauth": { ip: perMinute(30), user: perMinute(20) },
  "google-calendar-sync": { ip: MACHINE.ip, user: perMinute(10) },
  "canvas-sync": { ip: MACHINE.ip, user: perMinute(10) },
  // Public: the token in the URL is the credential; also limited per token (60/hour).
  "calendar-feed": { ip: IP_DEFAULT, user: null },
  "email-unsubscribe": { ip: perMinute(30), user: null },
  features: { ip: perMinute(300), user: null },
  "stripe-webhook": MACHINE,
  "revenuecat-webhook": MACHINE,
  "send-reminders": MACHINE,
  "send-email-digests": MACHINE,
  "nightly-replan": MACHINE,
  "flush-analytics": MACHINE,
  "ai-cost-monitor": MACHINE,
};

export function limitsFor(functionName: string): FunctionLimits {
  return FUNCTION_LIMITS[functionName] ?? { ip: IP_DEFAULT, user: USER_DEFAULT };
}

interface Scope {
  functionName: string;
  log: Logger;
  userChecked: boolean;
}
const scope = new AsyncLocalStorage<Scope>();

/** Runs `fn` with the request's function name available to requireUser's user limit. */
export function withRateLimitScope<T>(
  functionName: string,
  log: Logger,
  fn: () => Promise<T>,
): Promise<T> {
  return scope.run({ functionName, log, userChecked: false }, fn);
}

/**
 * The client's IP: Cloudflare's header (set by the edge, not the client), then the proxy's
 * x-real-ip, then the first x-forwarded-for entry.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip")?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function sha256Hex(value: string): Promise<string> {
  return encodeHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  );
}

const resultSchema = z.object({
  allowed: z.boolean(),
  remaining: z.number(),
  retry_after: z.number(),
});

/** Counts a hit on `bucket`; throws 429 with Retry-After when over `limit`. */
export async function enforce(bucket: string, limit: Limit, log?: Logger): Promise<void> {
  if (Deno.env.get("RATE_LIMITS_DISABLED") === "true") return;
  let result: z.infer<typeof resultSchema>;
  try {
    const { data, error } = await adminClient().rpc("rate_limit_hit", {
      p_bucket: bucket,
      p_limit: limit.limit,
      p_window_seconds: limit.windowSeconds,
    });
    if (error) throw error;
    result = resultSchema.parse(data);
  } catch (error) {
    log?.warn("rate limit check failed; allowing the request", {
      bucket: bucket.split(":")[0],
      error,
    });
    return;
  }
  if (!result.allowed) {
    throw new HttpError(
      429,
      "rate_limited",
      "Too many requests. Please wait a moment and try again.",
      { retry_after: result.retry_after },
      { "Retry-After": String(result.retry_after) },
    );
  }
}

/** The per-IP check createHandler runs before every function. */
export async function enforceIpLimit(functionName: string, req: Request, log: Logger) {
  const ip = await sha256Hex(clientIp(req));
  await enforce(`ip:${functionName}:${ip.slice(0, 32)}`, limitsFor(functionName).ip, log);
}

/** The per-user check requireUser runs once per request, after the token is verified. */
export async function enforceUserLimit(userId: string): Promise<void> {
  const current = scope.getStore();
  if (!current || current.userChecked) return;
  current.userChecked = true;
  const limit = limitsFor(current.functionName).user ?? USER_DEFAULT;
  await enforce(`user:${current.functionName}:${userId}`, limit, current.log);
}
