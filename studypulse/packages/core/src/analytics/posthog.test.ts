import { describe, expect, it, vi } from "vitest";

import { outboxEventSchema, PostHogError, sendPostHogBatch, toPostHogEvent } from "./posthog.ts";

const row = outboxEventSchema.parse({
  id: "0b6c5a8e-3f7d-4a61-9e2b-2a4f1c9d7e01",
  user_id: "3f0c6a1e-8a4b-4c1d-9e2f-0123456789ab",
  event: "session_logged",
  properties: { minutes: 40, source: "timer" },
  occurred_at: "2027-03-01 12:00:00+00",
});

describe("toPostHogEvent", () => {
  it("uses the outbox id as the event uuid, so retries dedupe", () => {
    expect(toPostHogEvent(row, "production")).toEqual({
      event: "session_logged",
      distinct_id: "3f0c6a1e-8a4b-4c1d-9e2f-0123456789ab",
      uuid: "0b6c5a8e-3f7d-4a61-9e2b-2a4f1c9d7e01",
      timestamp: "2027-03-01T12:00:00.000Z",
      properties: {
        minutes: 40,
        source: "timer",
        $lib: "studypulse-server",
        environment: "production",
        $ip: null,
        $geoip_disable: true,
      },
    });
  });

  it("rejects unknown event names", () => {
    expect(outboxEventSchema.safeParse({ ...row, event: "clicked_button" }).success).toBe(false);
  });
});

describe("sendPostHogBatch", () => {
  it("posts one batch with the project key", async () => {
    const fetchMock = vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(Response.json({ status: 1 })),
    );
    await sendPostHogBatch([row, row], {
      apiKey: "phc_test",
      host: "https://eu.i.posthog.com/",
      fetch: fetchMock,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://eu.i.posthog.com/batch/");
    const body = JSON.parse(init!.body as string) as { api_key: string; batch: unknown[] };
    expect(body.api_key).toBe("phc_test");
    expect(body.batch).toHaveLength(2);
  });

  it("throws on failure and skips empty batches", async () => {
    const fail = vi.fn(() => Promise.resolve(new Response("bad key", { status: 401 })));
    await expect(sendPostHogBatch([row], { apiKey: "x", fetch: fail })).rejects.toBeInstanceOf(
      PostHogError,
    );
    const none = vi.fn();
    await sendPostHogBatch([], { apiKey: "x", fetch: none });
    expect(none).not.toHaveBeenCalled();
  });
});

describe("data minimization (S25)", () => {
  it("never sends an IP address or asks PostHog to geolocate", () => {
    const e = toPostHogEvent(row, "production");
    expect(e.properties.$ip).toBeNull();
    expect(e.properties.$geoip_disable).toBe(true);
    expect(JSON.stringify(e)).not.toMatch(/email|name|title/i);
  });
});
