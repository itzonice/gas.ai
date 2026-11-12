// Runtime-agnostic Sentry settings shared by web, mobile, and edge functions.
// No Sentry import here: each runtime uses its own SDK and passes these through.
import type { AppEnv } from "../env/index.ts";

export * from "./logger.ts";

const SENSITIVE_KEY =
  /authorization|cookie|token|secret|password|passwd|api[-_]?key|service[-_]?role|signature|credential|jwt|private[-_]?key/i;
const REDACTED = "[redacted]";

/**
 * Fields that carry a student's syllabus or notes text, or model input and output built
 * from it (launch safety S31). Their values never reach logs or Sentry; only the length.
 */
const CONTENT_KEY =
  /^(?:text|notes|content|chunks?|prompt|completion|syllabus|syllabus_text|raw_text|pasted_text|extracted_text|page_text|parse_result|raw_output|model_output)$/i;

/** Any other string this long is probably pasted document text; stack traces are exempt. */
const MAX_TEXT_CHARS = 2000;

function redactContent(value: unknown): string {
  return typeof value === "string"
    ? `[redacted text: ${String(value.length)} chars]`
    : "[redacted text]";
}

/**
 * Secrets and personal data inside free text (error messages, URLs, stack traces), which
 * key-based redaction can't see (launch safety S31). Order matters: specific shapes first.
 */
const SENSITIVE_TEXT: [RegExp, string][] = [
  // JWTs (Supabase access tokens, the service-role key).
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g, REDACTED],
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`],
  // Provider keys: Stripe, Stripe webhook secrets, Anthropic, Resend.
  [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}/g, REDACTED],
  [/\bwhsec_[A-Za-z0-9]{8,}/g, REDACTED],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, REDACTED],
  [/\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{8,}/g, REDACTED],
  // Credentials in URLs: ?token=…, &code=…, and user:password@host.
  [
    /([?&](?:token|code|state|key|api_key|apikey|access_token|refresh_token|secret|password|signature|sig)=)[^&#\s"'<>]+/gi,
    `$1${REDACTED}`,
  ],
  [/(\/\/)[^/\s:@]+:[^/\s@]+@/g, `$1${REDACTED}@`],
  // Email addresses: logs and error reports don't need them (S25 data minimization).
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  // Long opaque tokens (calendar feed and unsubscribe tokens in paths, OAuth codes).
  // UUIDs (36 characters) and request ids stay readable.
  [/(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{40,}(?![A-Za-z0-9_-])/g, REDACTED],
];

/** Redacts secrets and email addresses inside a string. */
export function redactText(text: string): string {
  let out = text;
  for (const [re, replacement] of SENSITIVE_TEXT) out = out.replace(re, replacement);
  return out;
}

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
 * Recursively replaces values whose key looks sensitive, syllabus and notes text (by key,
 * or any string over 2,000 characters), and secrets or email addresses inside strings.
 * Returns a new value.
 */
export function redactSensitive<T>(value: T, depth = 0, key?: string): T {
  if (typeof value === "string") {
    if (value.length > MAX_TEXT_CHARS && key !== "stack") return redactContent(value) as T;
    return redactText(value) as T;
  }
  if (depth > 8 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((v: unknown) => redactSensitive(v, depth + 1, key)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE_KEY.test(k)
      ? REDACTED
      : CONTENT_KEY.test(k)
        ? redactContent(v)
        : redactSensitive(v, depth + 1, k);
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
  breadcrumbs?: { message?: string; data?: unknown }[];
  extra?: unknown;
  contexts?: unknown;
  tags?: unknown;
}

/**
 * `beforeSend` hook: drop cookies and redact credentials and email addresses before an
 * event leaves the process: request URL, query, headers, and body; the error message;
 * breadcrumbs (fetch URLs, console lines); and extra context.
 */
export function scrubEvent<E extends ScrubbableEvent>(event: E): E {
  if (event.request) {
    const { url, query_string } = event.request;
    event.request = {
      ...event.request,
      cookies: undefined,
      ...(url === undefined ? {} : { url: redactText(url) }),
      ...(query_string === undefined ? {} : { query_string: redactSensitive(query_string) }),
      headers: redactSensitive(event.request.headers),
      data: redactSensitive(event.request.data),
    };
  }
  if (event.message) event.message = redactText(event.message);
  for (const v of event.exception?.values ?? []) {
    if (v.value) v.value = redactText(v.value);
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((b) => ({
      ...b,
      ...(b.message === undefined ? {} : { message: redactText(b.message) }),
      ...(b.data === undefined ? {} : { data: redactSensitive(b.data) }),
    }));
  }
  if (event.extra) event.extra = redactSensitive(event.extra);
  if (event.contexts) event.contexts = redactSensitive(event.contexts);
  if (event.tags) event.tags = redactSensitive(event.tags);
  return event;
}
