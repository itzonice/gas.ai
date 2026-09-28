// Stripe webhooks: signature verification and mapping subscription events to our
// subscriptions table. The stripe-webhook function verifies, maps, and hands the result
// to apply_billing_event, which records the event id and upserts in one transaction.
import { z } from "zod";

/** Stripe's default: reject signatures older (or newer) than 5 minutes (replays). */
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;

export class StripeSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeSignatureError";
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(
    new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message))),
  );
}

/** A Stripe-Signature header for `payload` (tests and local tooling). */
export async function signStripePayload(
  payload: string,
  secret: string,
  timestamp: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  return `t=${String(timestamp)},v1=${await hmacHex(secret, `${String(timestamp)}.${payload}`)}`;
}

/**
 * Verifies a Stripe-Signature header against the raw request body (must be the exact
 * bytes Stripe sent; don't re-serialize parsed JSON). Throws StripeSignatureError.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  options: { toleranceSeconds?: number; now?: Date } = {},
): Promise<void> {
  if (!header) throw new StripeSignatureError("missing Stripe-Signature header");
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2).map((s) => s.trim());
    if (key === "t" && value && /^\d+$/.test(value)) timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  if (timestamp === null || !signatures.length) {
    throw new StripeSignatureError("malformed Stripe-Signature header");
  }
  const now = Math.floor((options.now ?? new Date()).getTime() / 1000);
  if (
    Math.abs(now - timestamp) > (options.toleranceSeconds ?? STRIPE_SIGNATURE_TOLERANCE_SECONDS)
  ) {
    throw new StripeSignatureError("signature timestamp outside the tolerance window");
  }
  const expected = await hmacHex(secret, `${String(timestamp)}.${payload}`);
  // Any v1 may match: Stripe sends one per active secret while a secret is being rolled.
  if (!signatures.some((s) => constantTimeEqual(s, expected))) {
    throw new StripeSignatureError("signature mismatch");
  }
}

// ------------------------------------------------------------------ events

export const stripeEventSchema = z.looseObject({
  id: z.string().startsWith("evt_"),
  type: z.string(),
  created: z.number().int(),
  livemode: z.boolean().optional(),
  data: z.looseObject({ object: z.looseObject({}) }),
});
export type StripeEvent = z.infer<typeof stripeEventSchema>;

const unixSeconds = z.number().int().nullish();

const stripeSubscriptionSchema = z.looseObject({
  id: z.string().startsWith("sub_"),
  object: z.literal("subscription"),
  customer: z.union([z.string(), z.looseObject({ id: z.string() })]),
  status: z.enum([
    "incomplete",
    "incomplete_expired",
    "trialing",
    "active",
    "past_due",
    "canceled",
    "unpaid",
    "paused",
  ]),
  cancel_at_period_end: z.boolean().default(false),
  canceled_at: unixSeconds,
  ended_at: unixSeconds,
  // Older API versions have the period on the subscription; newer ones on each item.
  current_period_end: unixSeconds,
  metadata: z.record(z.string(), z.string()).default({}),
  items: z
    .looseObject({
      data: z.array(
        z.looseObject({
          current_period_end: unixSeconds,
          price: z.looseObject({ id: z.string() }).nullish(),
        }),
      ),
    })
    .optional(),
});

/** Our subscription row, as apply_billing_event expects it. */
export interface SubscriptionUpdate {
  provider_subscription_id: string;
  provider_customer_id: string | null;
  /** From subscription metadata (set at checkout); the SQL falls back to the customer. */
  user_id: string | null;
  product_id: string | null;
  status:
    | "trialing"
    | "active"
    | "past_due"
    | "in_grace"
    | "paused"
    | "canceled"
    | "expired"
    | "refunded";
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  /** End of the store's billing-retry grace period, while access continues. */
  grace_period_ends_at?: string | null;
  /** Where it was bought, so clients can say where to manage it. */
  store?: "stripe" | "app_store" | "play_store" | "amazon" | "promotional" | "other";
}

export const STRIPE_SUBSCRIPTION_EVENTS = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
] as const;

const iso = (seconds: number | null | undefined) =>
  seconds == null ? null : new Date(seconds * 1000).toISOString();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Maps a Stripe subscription to our row, or null for states that never granted access
 * (incomplete: the first payment hasn't succeeded yet).
 */
export function mapStripeSubscription(object: unknown): SubscriptionUpdate | null {
  const sub = stripeSubscriptionSchema.parse(object);
  const status = ((): SubscriptionUpdate["status"] | null => {
    switch (sub.status) {
      case "incomplete":
        return null;
      case "incomplete_expired":
      case "unpaid":
        return "expired";
      default:
        return sub.status;
    }
  })();
  if (!status) return null;
  const item = sub.items?.data[0];
  const userId = sub.metadata.user_id;
  return {
    provider_subscription_id: sub.id,
    provider_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    user_id: userId && UUID_RE.test(userId) ? userId.toLowerCase() : null,
    product_id: item?.price?.id ?? null,
    status,
    current_period_end: iso(sub.current_period_end ?? item?.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at: iso(sub.canceled_at ?? sub.ended_at),
    store: "stripe",
  };
}

const chargeSchema = z.looseObject({
  id: z.string(),
  object: z.literal("charge"),
  amount: z.number().int(),
  amount_refunded: z.number().int(),
  refunded: z.boolean().optional(),
  invoice: z.union([z.string(), z.looseObject({ id: z.string() })]).nullish(),
  payment_intent: z.union([z.string(), z.looseObject({ id: z.string() })]).nullish(),
});
export type StripeRefundedCharge = z.infer<typeof chargeSchema>;

const disputeSchema = z.looseObject({
  id: z.string().startsWith("dp_"),
  object: z.literal("dispute"),
  charge: z.union([z.string(), z.looseObject({ id: z.string() })]),
  amount: z.number().int(),
  currency: z.string(),
  reason: z.string(),
  status: z.string(),
  evidence_details: z.looseObject({ due_by: z.number().int().nullish() }).nullish(),
});
export type StripeDispute = z.infer<typeof disputeSchema>;

const earlyFraudWarningSchema = z.looseObject({
  id: z.string().startsWith("issfr_"),
  object: z.literal("radar.early_fraud_warning"),
  actionable: z.boolean(),
  charge: z.union([z.string(), z.looseObject({ id: z.string() })]),
  fraud_type: z.string().optional(),
});
export type StripeEarlyFraudWarning = z.infer<typeof earlyFraudWarningSchema>;

export type StripeEventAction =
  | { kind: "subscription"; update: SubscriptionUpdate }
  /** A chargeback was opened (S20): alert, gather evidence, watch the dispute rate. */
  | { kind: "dispute"; dispute: StripeDispute }
  /** Radar's early fraud warning (S20): refund before it becomes a dispute. */
  | { kind: "fraud_warning"; warning: StripeEarlyFraudWarning }
  /** A full refund: revoke the subscription it paid for and stop billing. */
  | { kind: "refund"; charge: StripeRefundedCharge }
  | { kind: "ignore"; reason: string };

/** What to do with a verified event. */
export function stripeEventAction(event: StripeEvent): StripeEventAction {
  if ((STRIPE_SUBSCRIPTION_EVENTS as readonly string[]).includes(event.type)) {
    const update = mapStripeSubscription(event.data.object);
    return update
      ? { kind: "subscription", update }
      : { kind: "ignore", reason: "incomplete subscription" };
  }
  if (event.type === "charge.refunded") {
    const charge = chargeSchema.parse(event.data.object);
    // Partial refunds (goodwill credits) don't end access.
    return charge.amount > 0 && charge.amount_refunded >= charge.amount
      ? { kind: "refund", charge }
      : { kind: "ignore", reason: "partial refund" };
  }
  if (event.type === "charge.dispute.created") {
    return { kind: "dispute", dispute: disputeSchema.parse(event.data.object) };
  }
  if (event.type === "radar.early_fraud_warning.created") {
    const warning = earlyFraudWarningSchema.parse(event.data.object);
    return warning.actionable
      ? { kind: "fraud_warning", warning }
      : { kind: "ignore", reason: "early fraud warning is not actionable" };
  }
  return { kind: "ignore", reason: `unhandled event type ${event.type}` };
}
