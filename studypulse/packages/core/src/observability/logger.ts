// Structured JSON logger. One line per entry so Supabase log search can filter by
// request_id, function, or level. Credential-looking fields are redacted, and so are
// tokens, keys, and email addresses inside the message and any string field.
import { redactSensitive } from "./index.ts";
import { redactText } from "./redact.ts";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface Logger {
  readonly requestId: string;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** A logger with extra fields attached to every entry. */
  child(fields: LogFields): Logger;
}

export type LogSink = (level: LogLevel, line: string) => void;

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const consoleSink: LogSink = (level, line) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

export const REQUEST_ID_HEADER = "x-request-id";
// Accept caller-supplied IDs (e.g. from the web app or a proxy) only if they are short
// and plain, so they can't inject into logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/** Reuses a safe incoming x-request-id, otherwise generates a new UUID. */
export function resolveRequestId(headers: Headers): string {
  const incoming = headers.get(REQUEST_ID_HEADER);
  return incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : crypto.randomUUID();
}

function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  // Supabase/PostgREST errors are plain objects ({ message, code, details, hint }).
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const pick = (k: string) => (typeof e[k] === "string" ? { [k]: e[k] } : {});
    const fields = { ...pick("message"), ...pick("code"), ...pick("details"), ...pick("hint") };
    if (Object.keys(fields).length) return fields;
  }
  return { message: String(error) };
}

export interface LoggerOptions {
  requestId: string;
  fields?: LogFields;
  minLevel?: LogLevel;
  sink?: LogSink;
  now?: () => Date;
}

export function createLogger(options: LoggerOptions): Logger {
  const { requestId, fields = {}, minLevel = "debug", sink = consoleSink, now } = options;

  const write = (level: LogLevel, msg: string, extra: LogFields = {}) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel]) return;
    const merged = { ...fields, ...extra };
    if ("error" in merged) merged.error = serializeError(merged.error);
    const entry = {
      ts: (now?.() ?? new Date()).toISOString(),
      level,
      msg: redactText(msg),
      request_id: requestId,
      ...redactSensitive(merged),
    };
    let line: string;
    try {
      line = JSON.stringify(entry);
    } catch {
      line = JSON.stringify({
        ts: entry.ts,
        level,
        msg: entry.msg,
        request_id: requestId,
        unserializable: true,
      });
    }
    sink(level, line);
  };

  return {
    requestId,
    debug: (msg, extra) => {
      write("debug", msg, extra);
    },
    info: (msg, extra) => {
      write("info", msg, extra);
    },
    warn: (msg, extra) => {
      write("warn", msg, extra);
    },
    error: (msg, extra) => {
      write("error", msg, extra);
    },
    child: (extra) => createLogger({ ...options, fields: { ...fields, ...extra } }),
  };
}
