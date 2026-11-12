import { describe, expect, it } from "vitest";

import { redactSensitive, redactText, scrubEvent, sentryBaseOptions } from "./index.ts";

import { createLogger } from "./logger.ts";

/**
 * Key-shaped test values are assembled at runtime so the secret scanner (gitleaks) doesn't
 * flag this file; none of them is a real credential.
 */
const fake = (...parts: string[]) => parts.join("");

describe("sentryBaseOptions", () => {
  it("is disabled without a DSN", () => {
    expect(sentryBaseOptions(undefined, "development").enabled).toBe(false);
  });

  it("samples fewer traces in production", () => {
    expect(sentryBaseOptions("https://k@o.ingest.sentry.io/1", "production")).toMatchObject({
      enabled: true,
      tracesSampleRate: 0.1,
      sendDefaultPii: false,
    });
  });
});

describe("scrubEvent", () => {
  it("drops cookies and redacts credential-looking keys at any depth", () => {
    const event = scrubEvent({
      request: {
        cookies: { sb: "session" },
        headers: { Authorization: "Bearer abc", "content-type": "application/json" },
        data: { user: { password: "hunter2", name: "Ada" } },
      },
      extra: { stripe_api_key: "sk_live_x", items: [{ refresh_token: "r" }] },
    });
    expect(event.request.cookies).toBeUndefined();
    expect(event.request.headers).toEqual({
      Authorization: "[redacted]",
      "content-type": "application/json",
    });
    expect(event.request.data).toEqual({ user: { password: "[redacted]", name: "Ada" } });
    expect(event.extra).toEqual({
      stripe_api_key: "[redacted]",
      items: [{ refresh_token: "[redacted]" }],
    });
  });

  it("leaves ordinary values alone", () => {
    expect(redactSensitive("token")).toBe("token");
    expect(redactSensitive(42)).toBe(42);
  });

  it("scrubs the URL, message, exception, and breadcrumbs (S31)", () => {
    const token = "Zx9_".repeat(11); // 44 chars, like a calendar feed token
    const event = scrubEvent({
      message: "sync failed for ada@example.com",
      request: {
        url: `https://x.supabase.co/functions/v1/calendar-feed/${token}.ics`,
        query_string: "token=abc&scope=marketing",
      },
      exception: {
        values: [
          { value: `Stripe said: Invalid API Key ${fake("sk_", "live_", "51Habcdefgh12345")}` },
        ],
      },
      breadcrumbs: [
        {
          message: "GET /email-unsubscribe?token=abcdef&scope=digest",
          data: { url: `/x?code=123` },
        },
      ],
    });
    expect(event.message).toBe("sync failed for [email]");
    expect(event.request.url).toBe(
      "https://x.supabase.co/functions/v1/calendar-feed/[redacted].ics",
    );
    expect(event.exception.values[0]?.value).toBe("Stripe said: Invalid API Key [redacted]");
    expect(event.breadcrumbs[0]).toEqual({
      message: "GET /email-unsubscribe?token=[redacted]&scope=digest",
      data: { url: "/x?code=[redacted]" },
    });
  });
});

describe("redactText (S31)", () => {
  it.each([
    ["Authorization: Bearer abc.def-ghi_123", "Authorization: Bearer [redacted]"],
    [
      `key ${fake("eyJhbGciOiJIUzI1NiJ9", ".eyJyb2xlIjoic2VydmljZV9yb2xlIn0", ".c2lnbmF0dXJl")} here`,
      "key [redacted] here",
    ],
    [fake("whsec_", "abcdefghij1234"), "[redacted]"],
    [fake("sk-", "ant-api03-abcdefghijk"), "[redacted]"],
    [fake("re_", "abcdefgh_ijklmnopqrst"), "[redacted]"],
    [
      "postgres://postgres:hunter2@db.example.co:5432/postgres",
      "postgres://[redacted]@db.example.co:5432/postgres",
    ],
    ["/callback?state=s3cr3t&code=c0de&x=1", "/callback?state=[redacted]&code=[redacted]&x=1"],
    ["mail Ada.Lovelace+test@uni.ac.uk now", "mail [email] now"],
  ])("%s", (input, output) => {
    expect(redactText(input)).toBe(output);
  });

  it("keeps request ids, UUIDs, and ordinary words readable", () => {
    const text =
      "request 3f0c6a1e-8a4b-4c1d-9e2f-0123456789ab failed: duplicate key (23505) in plan_study";
    expect(redactText(text)).toBe(text);
  });
});

describe("syllabus and notes text (S31)", () => {
  it("never logs the text itself, only its length", () => {
    expect(
      redactSensitive({
        source: "paste",
        text: "BIO 201 Syllabus. Midterm Oct 14…",
        notes: ["Mitochondria"],
        chunk: { page: 1 },
        upload_id: "u1",
      }),
    ).toEqual({
      source: "paste",
      text: "[redacted text: 33 chars]",
      notes: "[redacted text]",
      chunk: "[redacted text]",
      upload_id: "u1",
    });
  });

  it("drops any very long string, but keeps stack traces", () => {
    const long = "Week 1: Cells. ".repeat(200);
    expect(redactSensitive({ detail: long })).toEqual({
      detail: `[redacted text: ${String(long.length)} chars]`,
    });
    expect(redactSensitive({ stack: long })).toEqual({ stack: long });
  });

  it("scrubs a Sentry event's request body for an upload", () => {
    const event = scrubEvent({ request: { data: { source: "paste", text: "Syllabus…" } } });
    expect(event.request.data).toEqual({ source: "paste", text: "[redacted text: 9 chars]" });
  });
});

describe("logger redaction (S31)", () => {
  it("redacts secrets in the message, error text, and stack", () => {
    const lines: string[] = [];
    const log = createLogger({ requestId: "req-12345678", sink: (_l, line) => lines.push(line) });
    const error = new Error("fetch https://api.example/x?token=abc failed for bob@example.com");
    log.error("charge failed for bob@example.com", { error });
    const entry = JSON.parse(lines[0]!) as {
      msg: string;
      error: { message: string; stack: string };
    };
    expect(entry.msg).toBe("charge failed for [email]");
    expect(entry.error.message).toBe(
      "fetch https://api.example/x?token=[redacted] failed for [email]",
    );
    expect(entry.error.stack).not.toContain("bob@example.com");
  });
});
