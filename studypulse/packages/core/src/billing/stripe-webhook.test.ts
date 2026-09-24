import { describe, expect, it } from "vitest";

import {
  mapStripeSubscription,
  signStripePayload,
  stripeEventAction,
  stripeEventSchema,
  StripeSignatureError,
  verifyStripeSignature,
} from "./stripe-webhook.ts";

const secret = "whsec_test_secret";
const payload = JSON.stringify({ id: "evt_1", type: "ping" });
const at = new Date("2027-03-01T12:00:00Z");
const t = at.getTime() / 1000;

describe("verifyStripeSignature", () => {
  it("accepts a valid signature", async () => {
    const header = await signStripePayload(payload, secret, t);
    await expect(
      verifyStripeSignature(payload, header, secret, { now: at }),
    ).resolves.toBeUndefined();
  });

  it("accepts any matching v1 while a secret is being rolled", async () => {
    const good = await signStripePayload(payload, secret, t);
    const header = `t=${String(t)},v1=${"0".repeat(64)},${good.split(",")[1]!},v0=legacy`;
    await expect(
      verifyStripeSignature(payload, header, secret, { now: at }),
    ).resolves.toBeUndefined();
  });

  it.each([
    ["missing header", null],
    ["malformed header", "garbage"],
    ["no v1", `t=${String(t)}`],
    ["wrong signature", `t=${String(t)},v1=${"a".repeat(64)}`],
  ])("rejects: %s", async (_name, header) => {
    await expect(
      verifyStripeSignature(payload, header, secret, { now: at }),
    ).rejects.toBeInstanceOf(StripeSignatureError);
  });

  it("rejects a modified body or another secret", async () => {
    const header = await signStripePayload(payload, secret, t);
    await expect(verifyStripeSignature(`${payload} `, header, secret, { now: at })).rejects.toThrow(
      /mismatch/,
    );
    await expect(
      verifyStripeSignature(payload, header, "whsec_other", { now: at }),
    ).rejects.toThrow(/mismatch/);
  });

  it("rejects replays outside the 5-minute window", async () => {
    const header = await signStripePayload(payload, secret, t - 301);
    await expect(verifyStripeSignature(payload, header, secret, { now: at })).rejects.toThrow(
      /tolerance/,
    );
    const fresh = await signStripePayload(payload, secret, t - 299);
    await expect(
      verifyStripeSignature(payload, fresh, secret, { now: at }),
    ).resolves.toBeUndefined();
  });
});

const user = "3f0c6a1e-8a4b-4c1d-9e2f-0123456789ab";
const subscription = (extra: Record<string, unknown> = {}) => ({
  id: "sub_123",
  object: "subscription",
  customer: "cus_123",
  status: "active",
  cancel_at_period_end: false,
  canceled_at: null,
  metadata: { user_id: user },
  items: {
    object: "list",
    data: [{ id: "si_1", current_period_end: 1_806_000_000, price: { id: "price_monthly" } }],
  },
  ...extra,
});

describe("mapStripeSubscription", () => {
  it("maps an active subscription (period end on the item, newer API versions)", () => {
    expect(mapStripeSubscription(subscription())).toEqual({
      provider_subscription_id: "sub_123",
      provider_customer_id: "cus_123",
      user_id: user,
      product_id: "price_monthly",
      status: "active",
      current_period_end: new Date(1_806_000_000 * 1000).toISOString(),
      cancel_at_period_end: false,
      canceled_at: null,
    });
  });

  it("reads the period end from the subscription on older API versions", () => {
    const mapped = mapStripeSubscription(
      subscription({ current_period_end: 1_700_000_000, items: { data: [] } }),
    );
    expect(mapped?.current_period_end).toBe(new Date(1_700_000_000 * 1000).toISOString());
    expect(mapped?.product_id).toBeNull();
  });

  it("maps Stripe statuses to ours", () => {
    const status = (s: string) => mapStripeSubscription(subscription({ status: s }))?.status;
    expect(status("trialing")).toBe("trialing");
    expect(status("past_due")).toBe("past_due");
    expect(status("canceled")).toBe("canceled");
    expect(status("paused")).toBe("paused");
    expect(status("unpaid")).toBe("expired");
    expect(status("incomplete_expired")).toBe("expired");
    expect(status("incomplete")).toBeUndefined();
  });

  it("records cancellation, and ignores metadata that isn't a user id", () => {
    const mapped = mapStripeSubscription(
      subscription({
        cancel_at_period_end: true,
        canceled_at: 1_805_000_000,
        customer: { id: "cus_999", object: "customer" },
        metadata: { user_id: "'; drop table x; --" },
      }),
    );
    expect(mapped).toMatchObject({
      cancel_at_period_end: true,
      canceled_at: new Date(1_805_000_000 * 1000).toISOString(),
      provider_customer_id: "cus_999",
      user_id: null,
    });
  });

  it("rejects objects that aren't subscriptions", () => {
    expect(() => mapStripeSubscription({ id: "in_1", object: "invoice" })).toThrow();
  });
});

describe("stripeEventAction", () => {
  const event = (type: string, object: unknown) =>
    stripeEventSchema.parse({ id: "evt_1", type, created: t, data: { object } });

  it("handles subscription lifecycle events", () => {
    for (const type of [
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ]) {
      expect(stripeEventAction(event(type, subscription())).kind).toBe("subscription");
    }
  });

  it("ignores incomplete subscriptions and other event types", () => {
    expect(
      stripeEventAction(
        event("customer.subscription.created", subscription({ status: "incomplete" })),
      ),
    ).toEqual({ kind: "ignore", reason: "incomplete subscription" });
    expect(stripeEventAction(event("invoice.created", { id: "in_1" }))).toEqual({
      kind: "ignore",
      reason: "unhandled event type invoice.created",
    });
  });
});
