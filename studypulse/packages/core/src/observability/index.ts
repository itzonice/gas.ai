// Runtime-agnostic Sentry settings shared by web, mobile, and edge functions.
// No Sentry import here: each runtime uses its own SDK and passes these through.
import type { AppEnv } from "../env/index.ts";

export * from "./logger.ts";

const SENSITIVE_KEY = /authorization|cookie|token|secret|password|api[-_]?key|service[-_]?role/i;
const REDACTED = "[redacted]";

export interface SentryBaseOptions {
  dsn: string | undefined;
  enabled: boolean;
  environment: AppEnv;
  tracesSampleRate: number;
  sendDefaultPii: false;
}

export function sentryBaseOptions(dsn: string | undefined, environment: AppEnv): SentryBaseOptions {
  return {
    dsn,
    // No DSN (local dev, tests) means the SDK stays fully disabled.
    enabled: Boolean(dsn),
    environment,
    tracesSampleRate: environment === "production" ? 0.1 : 1,
    sendDefaultPii: false,
  };
}

/** Recursively replaces values whose key looks sensitive. Returns a new value. */
export function redactSensitive<T>(value: T, depth = 0): T {
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v: unknown) => redactSensitive(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactSensitive(v, depth + 1);
  }
  return out as T;
}

interface ScrubbableEvent {
  request?: { headers?: unknown; cookies?: unknown; data?: unknown; query_string?: unknown };
  extra?: unknown;
  contexts?: unknown;
}

/** `beforeSend` hook: drop cookies and redact credentials before an event leaves the process. */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  if (event.request) {
    event.request = {
      ...event.request,
      cookies: undefined,
      headers: redactSensitive(event.request.headers),
      data: redactSensitive(event.request.data),
    };
  }
  if (event.extra) event.extra = redactSensitive(event.extra);
  if (event.contexts) event.contexts = redactSensitive(event.contexts);
  return event;
}
