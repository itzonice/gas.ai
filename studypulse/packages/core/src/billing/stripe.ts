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
  method: "GET" | "POST",
  path: string,
  params: FormObject,
  options: StripeOptions & { idempotencyKey?: string },
): Promise<z.infer<S>> {
  const base = (options.baseUrl ?? STRIPE_API_URL).replace(/\/+$/, "");
  const form = encodeStripeForm(params);
  const url = method === "GET" && form ? `${base}${path}?${form}` : `${base}${path}`;
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
