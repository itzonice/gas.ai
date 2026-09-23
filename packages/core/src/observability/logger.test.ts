import { describe, expect, it } from "vitest";

import { createLogger, resolveRequestId, type LogLevel } from "./logger.ts";

function capture(minLevel?: LogLevel) {
  const lines: { level: LogLevel; entry: Record<string, unknown> }[] = [];
  const logger = createLogger({
    requestId: "req-12345678",
    fields: { fn: "upload-syllabus" },
    ...(minLevel ? { minLevel } : {}),
    sink: (level, line) =>
      lines.push({ level, entry: JSON.parse(line) as Record<string, unknown> }),
    now: () => new Date("2026-01-15T12:00:00Z"),
  });
  return { logger, lines };
}

describe("createLogger", () => {
  it("writes one JSON line with request id, base fields, and extras", () => {
    const { logger, lines } = capture();
    logger.info("parsed", { pages: 3 });
    expect(lines).toEqual([
      {
        level: "info",
        entry: {
          ts: "2026-01-15T12:00:00.000Z",
          level: "info",
          msg: "parsed",
          request_id: "req-12345678",
          fn: "upload-syllabus",
          pages: 3,
        },
      },
    ]);
  });

  it("child loggers keep the request id and add fields", () => {
    const { logger, lines } = capture();
    logger.child({ user_id: "u1" }).warn("slow");
    expect(lines[0]?.entry).toMatchObject({
      request_id: "req-12345678",
      fn: "upload-syllabus",
      user_id: "u1",
    });
  });

  it("serializes errors and redacts secrets", () => {
    const { logger, lines } = capture();
    logger.error("failed", { error: new TypeError("boom"), api_key: "sk-1" });
    expect(lines[0]?.entry.error).toMatchObject({ name: "TypeError", message: "boom" });
    expect(lines[0]?.entry.api_key).toBe("[redacted]");
  });

  it("drops entries below the minimum level", () => {
    const { logger, lines } = capture("warn");
    logger.info("ignored");
    logger.warn("kept");
    expect(lines.map((l) => l.entry.msg)).toEqual(["kept"]);
  });
});

describe("resolveRequestId", () => {
  it("reuses a safe incoming id", () => {
    expect(resolveRequestId(new Headers({ "x-request-id": "abc-123_456" }))).toBe("abc-123_456");
  });

  it("replaces missing or unsafe ids with a UUID", () => {
    const uuid = /^[0-9a-f-]{36}$/;
    expect(resolveRequestId(new Headers())).toMatch(uuid);
    expect(resolveRequestId(new Headers({ "x-request-id": 'evil" {"level":"error"}' }))).toMatch(
      uuid,
    );
  });
});
