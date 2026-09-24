import { describe, expect, it, vi } from "vitest";

import {
  createCheckoutSession,
  createPortalSession,
  createStripeCustomer,
  encodeStripeForm,
  StripeError,
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
