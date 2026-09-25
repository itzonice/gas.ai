// Minimal Stripe API client: form-encoded requests, idempotency keys, typed errors, and
// zod-checked responses. Small on purpose (the calls StudyPulse makes, nothing else) and
// fetch-based, so it runs unchanged in edge functions (Deno) and Node tests.
import { z } from "zod";

export const STRIPE_API_URL = "https://api.stripe.com";

export interface StripeOptions {
  apiKey: string;
  fetch?: typeof fetch;
  /** Override for tests (e.g. stripe-mock). */
  baseUrl?: string;
  /**
   * Stripe-Version header. Unset uses the account's default API version; the fields
   * read here (ids, urls, statuses) are stable across versions.
   */
  apiVersion?: string;
}

export class StripeError extends Error {
  readonly status: number;
  readonly type: string | undefined;
  readonly code: string | undefined;

  constructor(status: number, message: string, type?: string, code?: string) {
    super(`Stripe ${String(status)}: ${message}`);
    this.name = "StripeError";
    this.status = status;
    this.type = type;
    this.code = code;
  }
}

type FormValue = string | number | boolean | null | undefined | FormObject | FormValue[];
interface FormObject {
  [key: string]: FormValue;
}

/** Stripe's bracket form encoding: {a: {b: [1]}} -> "a[b][0]=1". Skips null/undefined. */
export function encodeStripeForm(params: FormObject): string {
  const pairs: string[] = [];
  const walk = (prefix: string, value: FormValue) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        walk(`${prefix}[${String(i)}]`, v);
      });
    } else if (typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(prefix ? `${prefix}[${k}]` : k, v);
    } else {
      pairs.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(String(value))}`);
    }
  };
  walk("", params);
  return pairs.join("&");
}

const errorSchema = z.object({
  error: z.looseObject({
    message: z.string().optional(),
    type: z.string().optional(),
    code: z.string().optional(),
  }),
});

async function stripeRequest<S extends z.ZodType>(
  schema: S,
  method: "GET" | "POST" | "DELETE",
  path: string,
  params: FormObject,
  options: StripeOptions & { idempotencyKey?: string },
): Promise<z.infer<S>> {
  const base = (options.baseUrl ?? STRIPE_API_URL).replace(/\/+$/, "");
  const form = encodeStripeForm(params);
  const url = method !== "POST" && form ? `${base}${path}?${form}` : `${base}${path}`;
  const res = await (options.fetch ?? fetch)(url, {
    method,
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      ...(options.apiVersion ? { "Stripe-Version": options.apiVersion } : {}),
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    ...(method === "POST" ? { body: form } : {}),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = errorSchema.safeParse(json);
    throw err.success
      ? new StripeError(
          res.status,
          err.data.error.message ?? res.statusText,
          err.data.error.type,
          err.data.error.code,
        )
      : new StripeError(res.status, res.statusText);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new StripeError(res.status, `unexpected response for ${path}`);
  return parsed.data;
}

// ------------------------------------------------------------------ customers

const customerSchema = z.looseObject({ id: z.string().startsWith("cus_") });

/**
 * Creates the Stripe customer for a user. The idempotency key is derived from the user
 * id, so concurrent first checkouts (e.g. two tabs) get the same customer back.
 */
export async function createStripeCustomer(
  input: { userId: string; email?: string | undefined },
  options: StripeOptions,
): Promise<string> {
  const customer = await stripeRequest(
    customerSchema,
    "POST",
    "/v1/customers",
    { email: input.email, metadata: { user_id: input.userId } },
    { ...options, idempotencyKey: `customer-${input.userId}` },
  );
  return customer.id;
}

// ------------------------------------------------------------------ checkout

const sessionSchema = z.looseObject({ id: z.string(), url: z.url() });

export interface CheckoutInput {
  userId: string;
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  /** Let the customer type a promotion code on the Checkout page. */
  allowPromotionCodes?: boolean;
  /** Pre-applied promotion code id (promo_...). Stripe allows this or the field, not both. */
  promotionCodeId?: string;
  idempotencyKey: string;
}

/** A hosted Checkout page for a new subscription; returns its URL. */
export async function createCheckoutSession(
  input: CheckoutInput,
  options: StripeOptions,
): Promise<{ id: string; url: string }> {
  const session = await stripeRequest(
    sessionSchema,
    "POST",
    "/v1/checkout/sessions",
    {
      mode: "subscription",
      customer: input.customerId,
      client_reference_id: input.userId,
      line_items: [{ price: input.priceId, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      // The webhook maps subscriptions back to users with this.
      subscription_data: { metadata: { user_id: input.userId } },
      metadata: { user_id: input.userId },
      ...(input.promotionCodeId
        ? { discounts: [{ promotion_code: input.promotionCodeId }] }
        : { allow_promotion_codes: input.allowPromotionCodes ?? true }),
    },
    { ...options, idempotencyKey: input.idempotencyKey },
  );
  return { id: session.id, url: session.url };
}

// ------------------------------------------------------------------ portal

/** A Stripe customer-portal session (manage card, cancel, invoices); returns its URL. */
export async function createPortalSession(
  input: { customerId: string; returnUrl: string },
  options: StripeOptions,
): Promise<string> {
  const session = await stripeRequest(
    sessionSchema,
    "POST",
    "/v1/billing_portal/sessions",
    { customer: input.customerId, return_url: input.returnUrl },
    options,
  );
  return session.url;
}

// ------------------------------------------------------------------ refunds

const idOf = (v: string | { id: string } | null | undefined) =>
  v == null ? null : typeof v === "string" ? v : v.id;
const ref = z.union([z.string(), z.looseObject({ id: z.string() })]).nullish();

const invoiceSchema = z.looseObject({
  id: z.string(),
  // Older API versions.
  subscription: ref,
  // Newer API versions (2025-03-31.basil and later).
  parent: z
    .looseObject({
      subscription_details: z.looseObject({ subscription: ref }).nullish(),
    })
    .nullish(),
});

const invoicePaymentsSchema = z.looseObject({
  data: z.array(z.looseObject({ invoice: ref })),
});

/**
 * The subscription a charge paid for, or null (one-off charge). Works across API
 * versions: older charges name their invoice directly; newer ones are looked up through
 * invoice payments by payment intent.
 */
export async function subscriptionForCharge(
  charge: {
    invoice?: string | { id: string } | null;
    payment_intent?: string | { id: string } | null;
  },
  options: StripeOptions,
): Promise<string | null> {
  let invoiceId = idOf(charge.invoice);
  const paymentIntent = idOf(charge.payment_intent);
  if (!invoiceId && paymentIntent) {
    const payments = await stripeRequest(
      invoicePaymentsSchema,
      "GET",
      "/v1/invoice_payments",
      { payment: { type: "payment_intent", payment_intent: paymentIntent }, limit: 1 },
      options,
    );
    invoiceId = idOf(payments.data[0]?.invoice);
  }
  if (!invoiceId) return null;
  const invoice = await stripeRequest(
    invoiceSchema,
    "GET",
    `/v1/invoices/${encodeURIComponent(invoiceId)}`,
    {},
    options,
  );
  return idOf(invoice.subscription) ?? idOf(invoice.parent?.subscription_details?.subscription);
}

const subscriptionRefSchema = z.looseObject({ id: z.string(), status: z.string() });

/** Cancels a subscription now (no further invoices). No-op if it has already ended. */
export async function cancelStripeSubscription(
  subscriptionId: string,
  options: StripeOptions,
): Promise<void> {
  const path = `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`;
  const current = await stripeRequest(subscriptionRefSchema, "GET", path, {}, options);
  if (current.status === "canceled" || current.status === "incomplete_expired") return;
  await stripeRequest(subscriptionRefSchema, "DELETE", path, {}, options);
}

// ------------------------------------------------------------------ promotion codes

const promotionCodeSchema = z.looseObject({
  id: z.string().startsWith("promo_"),
  code: z.string(),
  active: z.boolean(),
  customer: ref,
  // Newer API versions: { type: "coupon", coupon }; older ones: coupon on the code.
  promotion: z.looseObject({ coupon: ref }).nullish(),
  coupon: ref,
  metadata: z.record(z.string(), z.string()).nullish(),
  expires_at: z.number().int().nullish(),
  max_redemptions: z.number().int().nullish(),
  times_redeemed: z.number().int().nullish(),
});

export interface PromotionCode {
  id: string;
  code: string;
  active: boolean;
  couponId: string | null;
  /** Restricted to one customer (codes we mint per student), else null. */
  customerId: string | null;
  metadata: Record<string, string>;
}

function toPromotionCode(p: z.infer<typeof promotionCodeSchema>): PromotionCode {
  return {
    id: p.id,
    code: p.code,
    active: p.active,
    couponId: idOf(p.promotion?.coupon) ?? idOf(p.coupon),
    customerId: idOf(p.customer),
    metadata: p.metadata ?? {},
  };
}

/** An active promotion code by the code customers type (case-insensitive), or null. */
export async function findPromotionCode(
  code: string,
  options: StripeOptions,
): Promise<PromotionCode | null> {
  const list = await stripeRequest(
    z.looseObject({ data: z.array(promotionCodeSchema) }),
    "GET",
    "/v1/promotion_codes",
    { code, active: true, limit: 1 },
    options,
  );
  const found = list.data[0];
  return found ? toPromotionCode(found) : null;
}

/**
 * Mints a single-use promotion code for `couponId`, usable only by `customerId`.
 * Sends the current API shape (promotion[coupon]) and falls back to the pre-2025 shape
 * (coupon) if the account's API version doesn't know it.
 */
export async function createCustomerPromotionCode(
  input: {
    couponId: string;
    customerId: string;
    expiresAt: Date;
    metadata?: Record<string, string>;
    idempotencyKey: string;
  },
  options: StripeOptions,
): Promise<PromotionCode> {
  const common = {
    customer: input.customerId,
    max_redemptions: 1,
    expires_at: Math.floor(input.expiresAt.getTime() / 1000),
    metadata: input.metadata,
  };
  try {
    return toPromotionCode(
      await stripeRequest(
        promotionCodeSchema,
        "POST",
        "/v1/promotion_codes",
        { ...common, promotion: { type: "coupon", coupon: input.couponId } },
        { ...options, idempotencyKey: input.idempotencyKey },
      ),
    );
  } catch (error) {
    if (!(
      error instanceof StripeError &&
      error.status === 400 &&
      error.message.includes("promotion")
    )) {
      throw error;
    }
    return toPromotionCode(
      await stripeRequest(
        promotionCodeSchema,
        "POST",
        "/v1/promotion_codes",
        { ...common, coupon: input.couponId },
        { ...options, idempotencyKey: `${input.idempotencyKey}-legacy` },
      ),
    );
  }
}

/**
 * Deletes a Stripe customer, which immediately cancels their subscriptions and removes
 * their saved payment methods (account deletion). Already-deleted customers are fine.
 */
export async function deleteStripeCustomer(
  customerId: string,
  options: StripeOptions,
): Promise<void> {
  try {
    await stripeRequest(
      z.looseObject({ id: z.string(), deleted: z.boolean().optional() }),
      "DELETE",
      `/v1/customers/${encodeURIComponent(customerId)}`,
      {},
      options,
    );
  } catch (error) {
    if (error instanceof StripeError && error.status === 404) return;
    throw error;
  }
}

// ------------------------------------------------------------------ prices

const priceSchema = z.looseObject({
  id: z.string(),
  unit_amount: z.number().int().nullable(),
  currency: z.string(),
  recurring: z.looseObject({ interval: z.enum(["day", "week", "month", "year"]) }).nullable(),
});
export type StripePrice = z.infer<typeof priceSchema>;

/** One price, to show the real amount next to the subscribe button (launch safety S16). */
export async function retrieveStripePrice(
  priceId: string,
  options: StripeOptions,
): Promise<StripePrice> {
  if (!/^price_[A-Za-z0-9]+$/.test(priceId)) throw new Error("not a Stripe price id");
  return stripeRequest(
    priceSchema,
    "GET",
    `/v1/prices/${encodeURIComponent(priceId)}`,
    {},
    options,
  );
}
