// RevenueCat (iOS and Android billing): the product catalog and webhook event mapping.
//
// Catalog (configure the same ids in App Store Connect, Google Play Console, and the
// RevenueCat dashboard):
// - Entitlement "pro", attached to every product below.
// - Offering "default" with packages $rc_monthly and $rc_annual.
// - Products: App Store "studypulse_pro_monthly" / "studypulse_pro_yearly";
//   Google Play subscription "studypulse_pro" with base plans "monthly" / "yearly"
//   (RevenueCat reports these as "studypulse_pro:monthly" / "studypulse_pro:yearly").
// - The app configures the SDK with appUserID = the Supabase user id, so webhook events
//   name our user directly.
// - Webhook: https://<project>.supabase.co/functions/v1/revenuecat-webhook with the
//   Authorization header set to REVENUECAT_WEBHOOK_AUTH.
import { z } from "zod";

import type { SubscriptionUpdate } from "./stripe-webhook.ts";

export const PRO_ENTITLEMENT = "pro";
export const REVENUECAT_OFFERING = "default";
export const REVENUECAT_PRODUCTS = {
  app_store: { monthly: "studypulse_pro_monthly", yearly: "studypulse_pro_yearly" },
  play_store: { monthly: "studypulse_pro:monthly", yearly: "studypulse_pro:yearly" },
} as const;
const KNOWN_PRODUCTS = new Set<string>(
  Object.values(REVENUECAT_PRODUCTS).flatMap((p) => Object.values(p)),
);

const ms = z.number().int().nullish();

export const revenueCatEventSchema = z.looseObject({
  id: z.string().min(1).max(255),
  type: z.string(),
  event_timestamp_ms: z.number().int(),
  app_user_id: z.string().nullish(),
  original_app_user_id: z.string().nullish(),
  aliases: z.array(z.string()).nullish(),
  product_id: z.string().nullish(),
  entitlement_ids: z.array(z.string()).nullish(),
  period_type: z.string().nullish(),
  purchased_at_ms: ms,
  expiration_at_ms: ms,
  grace_period_expiration_at_ms: ms,
  original_transaction_id: z.string().nullish(),
  store: z.string().nullish(),
  environment: z.string().nullish(),
  cancel_reason: z.string().nullish(),
});
export type RevenueCatEvent = z.infer<typeof revenueCatEventSchema>;

export const revenueCatWebhookSchema = z.looseObject({
  api_version: z.string().optional(),
  event: revenueCatEventSchema,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Our user id from the event: app_user_id, else an alias (e.g. after an anonymous start). */
export function revenueCatUserId(event: RevenueCatEvent): string | null {
  const candidates = [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  const id = candidates.find((c): c is string => typeof c === "string" && UUID_RE.test(c));
  return id ? id.toLowerCase() : null;
}

const iso = (millis: number | null | undefined) =>
  millis == null ? null : new Date(millis).toISOString();

export type RevenueCatAction =
  { kind: "subscription"; update: SubscriptionUpdate } | { kind: "ignore"; reason: string };

/** Event types that describe the subscription's current state. */
const STATE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "SUBSCRIPTION_EXTENDED",
  "CANCELLATION",
  "BILLING_ISSUE",
  "SUBSCRIPTION_PAUSED",
  "EXPIRATION",
]);

/** What to do with a RevenueCat event (pure; `now` decides whether grace has run out). */
export function revenueCatEventAction(
  event: RevenueCatEvent,
  now: Date = new Date(),
): RevenueCatAction {
  if (!STATE_EVENTS.has(event.type)) {
    return { kind: "ignore", reason: `unhandled event type ${event.type}` };
  }
  const grantsPro =
    (event.entitlement_ids ?? []).includes(PRO_ENTITLEMENT) ||
    (event.product_id != null && KNOWN_PRODUCTS.has(event.product_id));
  if (!grantsPro) return { kind: "ignore", reason: "not a Pro product" };
  if (!event.original_transaction_id) return { kind: "ignore", reason: "no transaction id" };
  // Web purchases are handled by our own Stripe webhook.
  if (event.store === "STRIPE")
    return { kind: "ignore", reason: "Stripe purchases come from Stripe" };

  const trial = event.period_type === "TRIAL";
  const store = ((): SubscriptionUpdate["store"] => {
    switch (event.store) {
      case "APP_STORE":
      case "MAC_APP_STORE":
        return "app_store";
      case "PLAY_STORE":
        return "play_store";
      case "AMAZON":
        return "amazon";
      case "PROMOTIONAL":
        return "promotional";
      default:
        return "other";
    }
  })();
  const base = {
    provider_subscription_id: event.original_transaction_id,
    provider_customer_id: event.original_app_user_id ?? event.app_user_id ?? null,
    user_id: revenueCatUserId(event),
    product_id: event.product_id ?? null,
    current_period_end: iso(event.expiration_at_ms),
    cancel_at_period_end: false,
    canceled_at: null,
    store,
  };
  const make = (
    status: SubscriptionUpdate["status"],
    extra: Partial<SubscriptionUpdate> = {},
  ): RevenueCatAction => ({
    kind: "subscription",
    update: { ...base, status, ...extra },
  });

  switch (event.type) {
    case "CANCELLATION":
      // Auto-renew was turned off; access continues until expiration. A refund through
      // the store (CUSTOMER_SUPPORT) ends it now.
      if (event.cancel_reason === "CUSTOMER_SUPPORT") {
        return make("refunded", { canceled_at: iso(event.event_timestamp_ms) });
      }
      return make(trial ? "trialing" : "active", {
        cancel_at_period_end: true,
        canceled_at: iso(event.event_timestamp_ms),
      });
    case "BILLING_ISSUE": {
      const graceEnds = event.grace_period_expiration_at_ms;
      return graceEnds != null && graceEnds > now.getTime()
        ? make("in_grace", { grace_period_ends_at: iso(graceEnds) })
        : make("past_due");
    }
    case "SUBSCRIPTION_PAUSED":
      return make("paused");
    case "EXPIRATION":
      return make("expired");
    default:
      return make(trial ? "trialing" : "active");
  }
}
