// Runtime-agnostic Sentry settings shared by web, mobile, and edge functions.
// No Sentry import here: each runtime uses its own SDK and passes these through.
import type { AppEnv } from "../env/index.ts";

import { redactText } from "./redact.ts";

export * from "./logger.ts";
export * from "./redact.ts";

const SENSITIVE_KEY = /authorization|cookie|token|secret|password|api[-_]?key|service[-_]?role/i;
const REDACTED = "[redacted]";

export interface SentryBaseOptions {
  dsn: string | undefined;
  enabled: boolean;
  environment: AppEnv;
  tracesSampleRate: number;
  sendDefaultPii: false;
  /**
   * Session replay stays off (launch safety S14). Turning it on requires opt-in consent,
   * masking all text and inputs, and a line in the privacy policy first.
   */
  replaysSessionSampleRate: 0;
  replaysOnErrorSampleRate: 0;
}

export function sentryBaseOptions(dsn: string | undefined, environment: AppEnv): SentryBaseOptions {
  return {
    dsn,
    // No DSN (local dev, tests) means the SDK stays fully disabled.
    enabled: Boolean(dsn),
    environment,
    tracesSampleRate: environment === "production" ? 0.1 : 1,
    sendDefaultPii: false,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  };
}

/**
 * Recursively replaces values whose key looks sensitive, and redacts credentials and
 * email addresses inside every string (`redactText`). Returns a new value.
 */
export function redactSensitive<T>(value: T, depth = 0): T {
  if (typeof value === "string") return redactText(value) as T;
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v: unknown) => redactSensitive(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactSensitive(v, depth + 1);
  }
  return out as T;
}

interface ScrubbableEvent {
  message?: string;
  request?: {
    url?: string;
    headers?: unknown;
    cookies?: unknown;
    data?: unknown;
    query_string?: unknown;
  };
  exception?: { values?: { value?: string }[] };
  breadcrumbs?: unknown[];
  tags?: unknown;
  extra?: unknown;
  contexts?: unknown;
}

/**
 * `beforeSend` hook: drop cookies and redact credentials, tokens, and email addresses
 * before an event leaves the process. Stack frames are left alone so source maps still
 * match; exception messages are redacted.
 */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  if (event.message) event.message = redactText(event.message);
  if (event.request) {
    event.request = {
      ...event.request,
      cookies: undefined,
      url: redactSensitive(event.request.url),
      headers: redactSensitive(event.request.headers),
      data: redactSensitive(event.request.data),
      query_string: redactSensitive(event.request.query_string),
    };
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = redactText(exception.value);
  }
  if (event.breadcrumbs) event.breadcrumbs = redactSensitive(event.breadcrumbs);
  if (event.tags) event.tags = redactSensitive(event.tags);
  if (event.extra) event.extra = redactSensitive(event.extra);
  if (event.contexts) event.contexts = redactSensitive(event.contexts);
  return event;
}
