import { describe, expect, it } from "vitest";

import {
  EXPO_PUSH_URL,
  getExpoReceipts,
  isDeadToken,
  sendExpoPush,
  type ExpoMessage,
} from "./expo.ts";

function fakeFetch(handler: (url: string, body: unknown) => unknown) {
  const calls: { url: string; body: unknown; headers: Record<string, string> }[] = [];
  const impl = ((url: string, init: RequestInit) => {
    const body: unknown = JSON.parse(init.body as string);
    calls.push({ url, body, headers: init.headers as Record<string, string> });
    return Promise.resolve(Response.json(handler(url, body)));
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const msg = (i: number): ExpoMessage => ({
  to: `ExponentPushToken[t${String(i)}]`,
  title: "Due soon",
  body: `Item ${String(i)}`,
});

describe("sendExpoPush", () => {
  it("sends in batches of 100 and returns tickets in order", async () => {
    const { impl, calls } = fakeFetch((_url, body) => ({
      data: (body as ExpoMessage[]).map((m) => ({ status: "ok", id: `ticket-${m.to}` })),
    }));
    const tickets = await sendExpoPush(
      Array.from({ length: 150 }, (_, i) => msg(i)),
      { fetch: impl, accessToken: "tok" },
    );
    expect(calls.map((c) => (c.body as unknown[]).length)).toEqual([100, 50]);
    expect(calls[0]?.url).toBe(EXPO_PUSH_URL);
    expect(calls[0]?.headers.Authorization).toBe("Bearer tok");
    expect(tickets[149]).toEqual({ status: "ok", id: "ticket-ExponentPushToken[t149]" });
  });

  it("flags DeviceNotRegistered tickets as dead tokens", async () => {
    const { impl } = fakeFetch(() => ({
      data: [
        { status: "ok", id: "a" },
        { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } },
        { status: "error", message: "too big", details: { error: "MessageTooBig" } },
      ],
    }));
    const tickets = await sendExpoPush([msg(0), msg(1), msg(2)], { fetch: impl });
    expect(tickets.map(isDeadToken)).toEqual([false, true, false]);
  });

  it("rejects malformed responses", async () => {
    const { impl } = fakeFetch(() => ({ data: [{ status: "ok" }] }));
    await expect(sendExpoPush([msg(0)], { fetch: impl })).rejects.toThrow();
  });
});

describe("getExpoReceipts", () => {
  it("returns receipts by ticket id", async () => {
    const { impl, calls } = fakeFetch(() => ({
      data: {
        a: { status: "ok" },
        b: { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      },
    }));
    const receipts = await getExpoReceipts(["a", "b"], { fetch: impl });
    expect(calls[0]?.body).toEqual({ ids: ["a", "b"] });
    expect(receipts.a && isDeadToken(receipts.a)).toBe(false);
    expect(receipts.b && isDeadToken(receipts.b)).toBe(true);
  });
});
