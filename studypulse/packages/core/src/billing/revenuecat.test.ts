import { describe, expect, it } from "vitest";

import {
  revenueCatEventAction,
  revenueCatEventSchema,
  revenueCatUserId,
  type RevenueCatEvent,
} from "./revenuecat.ts";

const user = "3f0c6a1e-8a4b-4c1d-9e2f-0123456789ab";
const now = new Date("2027-03-01T12:00:00Z");
const expires = Date.parse("2027-04-01T12:00:00Z");

const event = (type: string, extra: Partial<RevenueCatEvent> = {}): RevenueCatEvent =>
  revenueCatEventSchema.parse({
    id: "rc_evt_1",
    type,
    event_timestamp_ms: now.getTime(),
    app_user_id: user,
    original_app_user_id: user,
    product_id: "studypulse_pro_monthly",
    entitlement_ids: ["pro"],
    period_type: "NORMAL",
    expiration_at_ms: expires,
    original_transaction_id: "2000000123456789",
    store: "APP_STORE",
    environment: "PRODUCTION",
    ...extra,
  });

const update = (e: RevenueCatEvent) => {
  const action = revenueCatEventAction(e, now);
  if (action.kind !== "subscription") throw new Error(action.reason);
  return action.update;
};

describe("revenueCatEventAction", () => {
  it("maps a purchase to an active subscription keyed by the original transaction", () => {
    expect(update(event("INITIAL_PURCHASE"))).toEqual({
      provider_subscription_id: "2000000123456789",
      provider_customer_id: user,
      user_id: user,
      product_id: "studypulse_pro_monthly",
      status: "active",
      current_period_end: "2027-04-01T12:00:00.000Z",
      cancel_at_period_end: false,
      canceled_at: null,
      store: "app_store",
    });
  });

  it("marks free trials as trialing", () => {
    expect(update(event("INITIAL_PURCHASE", { period_type: "TRIAL" })).status).toBe("trialing");
  });

  it.each(["RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "SUBSCRIPTION_EXTENDED"])(
    "%s keeps the subscription active",
    (type) => {
      expect(update(event(type))).toMatchObject({ status: "active", cancel_at_period_end: false });
    },
  );

  it("keeps access after a cancellation until the period ends", () => {
    expect(update(event("CANCELLATION", { cancel_reason: "UNSUBSCRIBE" }))).toMatchObject({
      status: "active",
      cancel_at_period_end: true,
      canceled_at: now.toISOString(),
    });
  });

  it("ends access immediately on a store refund", () => {
    expect(update(event("CANCELLATION", { cancel_reason: "CUSTOMER_SUPPORT" })).status).toBe(
      "refunded",
    );
  });

  it("grants grace during a billing issue, then past_due once it runs out", () => {
    const graceEnds = now.getTime() + 6 * 86_400_000;
    expect(
      update(event("BILLING_ISSUE", { grace_period_expiration_at_ms: graceEnds })),
    ).toMatchObject({
      status: "in_grace",
      grace_period_ends_at: new Date(graceEnds).toISOString(),
    });
    expect(
      update(event("BILLING_ISSUE", { grace_period_expiration_at_ms: now.getTime() - 1 })).status,
    ).toBe("past_due");
    expect(update(event("BILLING_ISSUE")).status).toBe("past_due");
  });

  it("records the store so clients know where to manage it", () => {
    expect(update(event("RENEWAL", { store: "PLAY_STORE" })).store).toBe("play_store");
    expect(update(event("RENEWAL", { store: "PROMOTIONAL" })).store).toBe("promotional");
    expect(update(event("RENEWAL", { store: "SOMETHING_NEW" })).store).toBe("other");
  });

  it("maps pauses and expirations", () => {
    expect(update(event("SUBSCRIPTION_PAUSED", { store: "PLAY_STORE" })).status).toBe("paused");
    expect(update(event("EXPIRATION")).status).toBe("expired");
  });

  it("recognizes Pro by product id when entitlements are missing", () => {
    expect(
      update(event("RENEWAL", { entitlement_ids: null, product_id: "studypulse_pro:yearly" }))
        .status,
    ).toBe("active");
  });

  it("ignores other products, test pings, Stripe purchases, and unknown types", () => {
    const reason = (e: RevenueCatEvent) => {
      const a = revenueCatEventAction(e, now);
      return a.kind === "ignore" ? a.reason : "applied";
    };
    expect(reason(event("INITIAL_PURCHASE", { entitlement_ids: [], product_id: "other" }))).toBe(
      "not a Pro product",
    );
    expect(reason(event("TEST"))).toBe("unhandled event type TEST");
    expect(reason(event("TRANSFER"))).toBe("unhandled event type TRANSFER");
    expect(reason(event("RENEWAL", { store: "STRIPE" }))).toBe("Stripe purchases come from Stripe");
    expect(reason(event("RENEWAL", { original_transaction_id: null }))).toBe("no transaction id");
  });
});

describe("revenueCatUserId", () => {
  it("uses app_user_id, else a UUID alias (purchase made before sign-in)", () => {
    expect(revenueCatUserId(event("RENEWAL"))).toBe(user);
    expect(
      revenueCatUserId(
        event("RENEWAL", {
          app_user_id: "$RCAnonymousID:abc",
          original_app_user_id: "$RCAnonymousID:abc",
          aliases: ["$RCAnonymousID:abc", user.toUpperCase()],
        }),
      ),
    ).toBe(user);
    expect(
      revenueCatUserId(
        event("RENEWAL", {
          app_user_id: "$RCAnonymousID:abc",
          original_app_user_id: null,
          aliases: [],
        }),
      ),
    ).toBeNull();
  });
});
