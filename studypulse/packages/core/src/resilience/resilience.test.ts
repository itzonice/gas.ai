import fc from "fast-check";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  backoffMs,
  BREAKER_COOLDOWN_MS,
  CircuitBreaker,
  CircuitOpenError,
  resetBreakersForTests,
  resilientFetch,
  retryAfterMs,
  RETRY_MAX_MS,
} from "./index.ts";

type FetchInput = Parameters<typeof fetch>[0];

const noSleep = () => Promise.resolve();

function scripted(...steps: (number | Error)[]) {
  const calls: RequestInit[] = [];
  const fn = vi.fn((_input: FetchInput, init?: RequestInit) => {
    calls.push(init ?? {});
    const step = steps[Math.min(calls.length - 1, steps.length - 1)]!;
    if (step instanceof Error) return Promise.reject(step);
    return Promise.resolve(new Response(`status ${String(step)}`, { status: step }));
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

beforeEach(() => {
  resetBreakersForTests();
});

describe("backoffMs", () => {
  it("is full jitter under an exponential cap that never exceeds the maximum", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.double({ min: 0, max: 0.999999, noNaN: true }),
        (n, r) => {
          const ms = backoffMs(n, () => r);
          const cap = Math.min(RETRY_MAX_MS, 250 * 2 ** (n - 1));
          return ms >= 0 && ms < cap && ms <= RETRY_MAX_MS;
        },
      ),
    );
  });
});

describe("retryAfterMs", () => {
  it("reads seconds and HTTP dates", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    expect(retryAfterMs(new Response(null, { headers: { "retry-after": "3" } }), now)).toBe(3000);
    expect(
      retryAfterMs(
        new Response(null, { headers: { "retry-after": "Fri, 25 Sep 2026 12:00:05 GMT" } }),
        now,
      ),
    ).toBe(5000);
    expect(retryAfterMs(new Response(null), now)).toBeNull();
    expect(
      retryAfterMs(new Response(null, { headers: { "retry-after": "soon" } }), now),
    ).toBeNull();
  });
});

describe("resilientFetch", () => {
  const breaker = () => new CircuitBreaker("stripe", { threshold: 100 });

  it("makes at most 3 attempts, however many are asked for", async () => {
    const { fn, calls } = scripted(500);
    const f = resilientFetch("stripe", {
      fetch: fn,
      attempts: 10,
      sleep: noSleep,
      breaker: breaker(),
    });
    const res = await f("https://api.example/x", { method: "GET" });
    expect(res.status).toBe(500);
    expect(calls).toHaveLength(3);
  });

  it("returns the first success without retrying", async () => {
    const { fn, calls } = scripted(503, 200);
    const f = resilientFetch("stripe", { fetch: fn, sleep: noSleep, breaker: breaker() });
    expect((await f("https://api.example/x", { method: "POST" })).status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it("waits with jittered, growing backoff between tries", async () => {
    const waits: number[] = [];
    const { fn } = scripted(500);
    const f = resilientFetch("stripe", {
      fetch: fn,
      sleep: (ms) => (waits.push(ms), Promise.resolve()),
      random: () => 0.5,
      breaker: breaker(),
    });
    await f("https://api.example/x");
    expect(waits).toEqual([125, 250]);
  });

  it("does not repeat a non-idempotent POST after a 500 or a dropped connection", async () => {
    for (const step of [500, new TypeError("connection reset")]) {
      const { fn, calls } = scripted(step, 200);
      const f = resilientFetch("expo", { fetch: fn, sleep: noSleep, breaker: breaker() });
      const attempt = f("https://exp.host/push/send", { method: "POST", body: "{}" });
      if (step instanceof Error) await expect(attempt).rejects.toThrow("connection reset");
      else expect((await attempt).status).toBe(500);
      expect(calls).toHaveLength(1);
    }
  });

  it("repeats a POST the provider didn't process (429, 503, 529)", async () => {
    for (const status of [429, 503, 529]) {
      const { fn, calls } = scripted(status, 200);
      const f = resilientFetch("expo", { fetch: fn, sleep: noSleep, breaker: breaker() });
      expect((await f("https://exp.host/push/send", { method: "POST", body: "{}" })).status).toBe(
        200,
      );
      expect(calls).toHaveLength(2);
    }
  });

  it("repeats a POST that carries an Idempotency-Key, or when the provider is idempotent", async () => {
    const a = scripted(new TypeError("reset"), 200);
    const withKey = resilientFetch("stripe", { fetch: a.fn, sleep: noSleep, breaker: breaker() });
    expect(
      (
        await withKey("https://api.stripe.com/v1/customers", {
          method: "POST",
          headers: { "Idempotency-Key": "k" },
        })
      ).status,
    ).toBe(200);
    const b = scripted(500, 200);
    const ai = resilientFetch("anthropic", {
      fetch: b.fn,
      sleep: noSleep,
      idempotent: true,
      breaker: breaker(),
    });
    expect((await ai("https://api.anthropic.com/v1/messages", { method: "POST" })).status).toBe(
      200,
    );
  });

  it("never retries client errors", async () => {
    const { fn, calls } = scripted(400, 200);
    const f = resilientFetch("stripe", { fetch: fn, sleep: noSleep, breaker: breaker() });
    expect((await f("https://api.example/x")).status).toBe(400);
    expect(calls).toHaveLength(1);
  });

  it("honours a short Retry-After and gives up on a long one", async () => {
    const waits: number[] = [];
    const short = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 429, headers: { "retry-after": "2" } })),
    ) as unknown as typeof fetch;
    await resilientFetch("stripe", {
      fetch: short,
      sleep: (ms) => (waits.push(ms), Promise.resolve()),
      random: () => 0,
      breaker: breaker(),
    })("https://api.example/x");
    expect(waits).toEqual([2000, 2000]);

    const long = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 429, headers: { "retry-after": "120" } })),
    );
    const res = await resilientFetch("stripe", {
      fetch: long as unknown as typeof fetch,
      sleep: noSleep,
      breaker: breaker(),
    })("https://api.example/x");
    expect(res.status).toBe(429);
    expect(long).toHaveBeenCalledTimes(1);
  });

  it("stops at once when the caller aborts", async () => {
    const controller = new AbortController();
    controller.abort();
    const { fn, calls } = scripted(new DOMException("aborted", "AbortError"));
    const f = resilientFetch("google", { fetch: fn, sleep: noSleep, breaker: breaker() });
    await expect(
      f("https://www.googleapis.com/x", { signal: controller.signal }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("sends a stream body only once", async () => {
    const { fn, calls } = scripted(503, 200);
    const f = resilientFetch("resend", { fetch: fn, sleep: noSleep, breaker: breaker() });
    const body = new ReadableStream({
      start: (c) => {
        c.close();
      },
    });
    expect((await f("https://api.resend.com/emails", { method: "POST", body })).status).toBe(503);
    expect(calls).toHaveLength(1);
  });
});

describe("circuit breaker", () => {
  it("opens after 5 failed calls in a row and fails fast for 5 minutes", async () => {
    let now = 1_000_000;
    const opened = vi.fn();
    const b = new CircuitBreaker("resend", { now: () => now, onOpen: opened });
    const { fn, calls } = scripted(500);
    const f = resilientFetch("resend", { fetch: fn, sleep: noSleep, breaker: b });
    for (let i = 0; i < 5; i++) await f("https://api.resend.com/x");
    expect(calls).toHaveLength(15); // 5 calls × 3 attempts
    expect(opened).toHaveBeenCalledWith("resend", now + BREAKER_COOLDOWN_MS);

    const err = await f("https://api.resend.com/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CircuitOpenError);
    expect((err as CircuitOpenError).retryAfterSeconds(now)).toBe(300);
    expect(calls).toHaveLength(15);

    now += BREAKER_COOLDOWN_MS - 1;
    await expect(f("https://api.resend.com/x")).rejects.toBeInstanceOf(CircuitOpenError);
    expect(calls).toHaveLength(15);
  });

  it("lets one trial call through after the cooldown; success closes it", () => {
    let now = 0;
    const b = new CircuitBreaker("google", { threshold: 1, now: () => now });
    b.failure();
    expect(b.state).toBe("open");
    now += BREAKER_COOLDOWN_MS;
    expect(b.state).toBe("half-open");
    b.check(); // the trial
    expect(() => {
      b.check();
    }).toThrow(CircuitOpenError); // no second call during the trial
    b.success();
    expect(b.state).toBe("closed");
    expect(() => {
      b.check();
    }).not.toThrow();
  });

  it("reopens for another cooldown when the trial fails", () => {
    let now = 0;
    const b = new CircuitBreaker("google", { threshold: 5, now: () => now });
    b.openUntilAtLeast(10);
    now = 10;
    b.check();
    b.failure();
    expect(b.state).toBe("open");
    now = 10 + BREAKER_COOLDOWN_MS - 1;
    expect(b.state).toBe("open");
  });

  it("an aborted trial frees the slot for the next caller", () => {
    let now = 0;
    const b = new CircuitBreaker("google", { threshold: 1, now: () => now });
    b.failure();
    now = BREAKER_COOLDOWN_MS;
    b.check();
    b.abandon();
    expect(() => {
      b.check();
    }).not.toThrow();
  });

  it("a success resets the failure count", () => {
    const b = new CircuitBreaker("stripe", { threshold: 3 });
    b.failure();
    b.failure();
    b.success();
    b.failure();
    b.failure();
    expect(b.state).toBe("closed");
  });
});
