import { describe, expect, it, vi } from "vitest";

import {
  cancelStripeSubscription,
  createCheckoutSession,
  createPortalSession,
  deleteStripeCustomer,
  createStripeCustomer,
  encodeStripeForm,
  StripeError,
  subscriptionForCharge,
} from "./stripe.ts";

const user = "3f0c6a1e-8a4b-4c1d-9e2f-0123456789ab";

function mockFetch(body: unknown, status = 200) {
  return vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(Response.json(body, { status })),
  );
}
const form = (init: RequestInit | undefined) =>
  Object.fromEntries(new URLSearchParams(init?.body as string));

describe("encodeStripeForm", () => {
  it("uses bracket notation for nested objects and arrays and skips empty values", () => {
    expect(
      decodeURIComponent(
        encodeStripeForm({
          mode: "subscription",
          line_items: [{ price: "price_1", quantity: 1 }],
          metadata: { user_id: "u" },
          allow_promotion_codes: true,
          email: undefined,
          skip: null,
        }),
      ),
    ).toBe(
      "mode=subscription&line_items[0][price]=price_1&line_items[0][quantity]=1&metadata[user_id]=u&allow_promotion_codes=true",
    );
  });

  it("escapes values", () => {
    expect(encodeStripeForm({ success_url: "https://x.test/a?b=1&c={ID}" })).toBe(
      "success_url=https%3A%2F%2Fx.test%2Fa%3Fb%3D1%26c%3D%7BID%7D",
    );
  });
});

describe("createStripeCustomer", () => {
  it("creates a customer tagged with the user id, idempotent per user", async () => {
    const fetchMock = mockFetch({ id: "cus_123", object: "customer" });
    const id = await createStripeCustomer(
      { userId: user, email: "ada@example.com" },
      { apiKey: "sk_test_1", fetch: fetchMock },
    );
    expect(id).toBe("cus_123");
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/customers");
    expect(init!.headers).toMatchObject({
      Authorization: "Bearer sk_test_1",
      "Idempotency-Key": `customer-${user}`,
    });
    expect(init!.headers).not.toHaveProperty("Stripe-Version");
    expect(form(init)).toEqual({ email: "ada@example.com", "metadata[user_id]": user });
  });
});

describe("createCheckoutSession", () => {
  const input = {
    userId: user,
    customerId: "cus_123",
    priceId: "price_monthly",
    successUrl: "https://app.test/billing/success?session_id={CHECKOUT_SESSION_ID}",
    cancelUrl: "https://app.test/billing",
    idempotencyKey: "checkout-1",
  };

  it("starts a subscription checkout linked to the user", async () => {
    const fetchMock = mockFetch({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" });
    const session = await createCheckoutSession(input, {
      apiKey: "sk_test_1",
      fetch: fetchMock,
      apiVersion: "2025-03-31.basil",
    });
    expect(session).toEqual({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init!.headers).toMatchObject({
      "Stripe-Version": "2025-03-31.basil",
      "Idempotency-Key": "checkout-1",
    });
    expect(form(init)).toEqual({
      mode: "subscription",
      customer: "cus_123",
      client_reference_id: user,
      "line_items[0][price]": "price_monthly",
      "line_items[0][quantity]": "1",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      "subscription_data[metadata][user_id]": user,
      "metadata[user_id]": user,
      allow_promotion_codes: "true",
    });
  });

  it("turns on Stripe Tax so the total with tax shows before payment (S26)", async () => {
    const fetchMock = mockFetch({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" });
    await createCheckoutSession(
      { ...input, automaticTax: true },
      { apiKey: "k", fetch: fetchMock },
    );
    expect(form(fetchMock.mock.calls[0]![1])).toMatchObject({
      "automatic_tax[enabled]": "true",
      "customer_update[address]": "auto",
    });
  });

  it("pre-applies a promotion code instead of showing the field", async () => {
    const fetchMock = mockFetch({ id: "cs_1", url: "https://checkout.stripe.com/c/pay/cs_1" });
    await createCheckoutSession(
      { ...input, promotionCodeId: "promo_1" },
      { apiKey: "k", fetch: fetchMock },
    );
    const sent = form(fetchMock.mock.calls[0]![1]);
    expect(sent["discounts[0][promotion_code]"]).toBe("promo_1");
    expect(sent).not.toHaveProperty("allow_promotion_codes");
  });

  it("raises StripeError with Stripe's message, type, and code", async () => {
    const fetchMock = mockFetch(
      {
        error: {
          message: "No such price: 'price_x'",
          type: "invalid_request_error",
          code: "resource_missing",
        },
      },
      400,
    );
    const error = await createCheckoutSession(input, { apiKey: "k", fetch: fetchMock }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(StripeError);
    expect(error).toMatchObject({
      status: 400,
      type: "invalid_request_error",
      code: "resource_missing",
      message: "Stripe 400: No such price: 'price_x'",
    });
  });

  it("rejects responses without a checkout URL", async () => {
    await expect(
      createCheckoutSession(input, { apiKey: "k", fetch: mockFetch({ id: "cs_1" }) }),
    ).rejects.toThrow(/unexpected response/);
  });
});

describe("createPortalSession", () => {
  it("returns the portal URL", async () => {
    const fetchMock = mockFetch({ id: "bps_1", url: "https://billing.stripe.com/p/session/x" });
    expect(
      await createPortalSession(
        { customerId: "cus_123", returnUrl: "https://app.test/settings/billing" },
        { apiKey: "k", fetch: fetchMock, baseUrl: "http://127.0.0.1:12111/" },
      ),
    ).toBe("https://billing.stripe.com/p/session/x");
    expect(fetchMock.mock.calls[0]![0]).toBe("http://127.0.0.1:12111/v1/billing_portal/sessions");
  });
});

describe("refund helpers", () => {
  function router(routes: Record<string, unknown>) {
    return vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const u = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
      const key = `${init?.method ?? "GET"} ${u.pathname}`;
      const body = routes[key];
      return Promise.resolve(
        body === undefined
          ? Response.json({ error: { message: `no route ${key}` } }, { status: 404 })
          : Response.json(body),
      );
    });
  }

  it("finds the subscription through the charge's invoice (older API versions)", async () => {
    const fetchMock = router({ "GET /v1/invoices/in_1": { id: "in_1", subscription: "sub_1" } });
    expect(
      await subscriptionForCharge({ invoice: "in_1" }, { apiKey: "k", fetch: fetchMock }),
    ).toBe("sub_1");
  });

  it("finds it through invoice payments on newer API versions", async () => {
    const fetchMock = router({
      "GET /v1/invoice_payments": { data: [{ invoice: "in_2" }] },
      "GET /v1/invoices/in_2": {
        id: "in_2",
        parent: { subscription_details: { subscription: "sub_2" } },
      },
    });
    expect(
      await subscriptionForCharge({ payment_intent: "pi_2" }, { apiKey: "k", fetch: fetchMock }),
    ).toBe("sub_2");
    const listUrl = new URL(fetchMock.mock.calls[0]![0]);
    expect(listUrl.searchParams.get("payment[payment_intent]")).toBe("pi_2");
    expect(listUrl.searchParams.get("payment[type]")).toBe("payment_intent");
  });

  it("returns null for one-off charges", async () => {
    const fetchMock = router({ "GET /v1/invoice_payments": { data: [] } });
    expect(
      await subscriptionForCharge({ payment_intent: "pi_3" }, { apiKey: "k", fetch: fetchMock }),
    ).toBeNull();
    expect(await subscriptionForCharge({}, { apiKey: "k", fetch: fetchMock })).toBeNull();
  });

  it("cancels an active subscription and leaves an ended one alone", async () => {
    const active = router({
      "GET /v1/subscriptions/sub_1": { id: "sub_1", status: "active" },
      "DELETE /v1/subscriptions/sub_1": { id: "sub_1", status: "canceled" },
    });
    await cancelStripeSubscription("sub_1", { apiKey: "k", fetch: active });
    expect(active.mock.calls.map((c) => c[1]?.method)).toEqual(["GET", "DELETE"]);

    const ended = router({ "GET /v1/subscriptions/sub_1": { id: "sub_1", status: "canceled" } });
    await cancelStripeSubscription("sub_1", { apiKey: "k", fetch: ended });
    expect(ended).toHaveBeenCalledTimes(1);
  });
});

describe("deleteStripeCustomer", () => {
  it("deletes the customer (which cancels their subscriptions)", async () => {
    const fetchMock = mockFetch({ id: "cus_1", deleted: true });
    await deleteStripeCustomer("cus_1", { apiKey: "k", fetch: fetchMock });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.stripe.com/v1/customers/cus_1");
    expect(init!.method).toBe("DELETE");
  });

  it("treats an already-deleted customer as done, and surfaces other errors", async () => {
    const gone = mockFetch(
      { error: { message: "No such customer", code: "resource_missing" } },
      404,
    );
    await expect(
      deleteStripeCustomer("cus_1", { apiKey: "k", fetch: gone }),
    ).resolves.toBeUndefined();
    const down = mockFetch({ error: { message: "Server error" } }, 500);
    await expect(
      deleteStripeCustomer("cus_1", { apiKey: "k", fetch: down }),
    ).rejects.toBeInstanceOf(StripeError);
  });
});
