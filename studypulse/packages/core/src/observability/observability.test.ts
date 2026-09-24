import { describe, expect, it } from "vitest";

import { redactSensitive, scrubEvent, sentryBaseOptions } from "./index.ts";

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

  it("leaves primitives alone", () => {
    expect(redactSensitive("token")).toBe("token");
  });
});
