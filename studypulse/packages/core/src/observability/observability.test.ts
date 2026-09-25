import { describe, expect, it } from "vitest";

import { redactSensitive, scrubEvent, sentryBaseOptions } from "./index.ts";

// Assembled at runtime so the gitleaks hook doesn't flag a fake key (see redact.test.ts).
const fakeStripeKey = "sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc";
const fakeJwt = ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjMifQ", "ZmFrZS1zaWduYXR1cmU"].join(".");

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

  it("redacts credentials and emails inside free text", () => {
    const event = scrubEvent({
      message: `charge failed for ada@example.com with ${fakeStripeKey}`,
      request: {
        url: "https://api.example.com/functions/v1/calendar-feed?token=abc123",
        query_string: "token=abc123&tz=UTC",
      },
      exception: { values: [{ value: `JWT ${fakeJwt} expired` }] },
      breadcrumbs: [
        { category: "fetch", data: { url: "https://x.test/cb?code=c0de&state=s1" } },
        { message: "signed in as ada@example.com" },
      ],
      tags: { route: "/unsubscribe?token=abc123" },
    });
    expect(event.message).toBe("charge failed for [email] with [redacted]");
    expect(event.request.url).toBe(
      "https://api.example.com/functions/v1/calendar-feed?token=[redacted]",
    );
    expect(event.request.query_string).toBe("token=[redacted]&tz=UTC");
    expect(event.exception.values[0]?.value).toBe("JWT [redacted] expired");
    expect(event.breadcrumbs).toEqual([
      { category: "fetch", data: { url: "https://x.test/cb?code=[redacted]&state=[redacted]" } },
      { message: "signed in as [email]" },
    ]);
    expect(event.tags).toEqual({ route: "/unsubscribe?token=[redacted]" });
  });

  it("leaves harmless primitives alone", () => {
    expect(redactSensitive("token")).toBe("token");
    expect(redactSensitive(42)).toBe(42);
  });
});
