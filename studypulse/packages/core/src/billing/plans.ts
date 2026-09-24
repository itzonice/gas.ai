// What users can buy on the web. Stripe price ids come from the environment
// (STRIPE_PRICE_MONTHLY / STRIPE_PRICE_YEARLY), so test and live mode differ only there.
import { z } from "zod";

export const billingIntervalSchema = z.enum(["monthly", "yearly"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

export const checkoutInputSchema = z.object({
  interval: billingIntervalSchema,
});
export type CheckoutRequest = z.infer<typeof checkoutInputSchema>;

/** Subscription states that grant Pro (grace: a renewal failed but access continues). */
export const ACTIVE_SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "in_grace"] as const;

/** billing_status(): the signed-in user's plan, on every platform. */
export const billingStatusSchema = z.object({
  pro: z.boolean(),
  subscription: z
    .object({
      provider: z.enum(["stripe", "revenuecat"]),
      store: z
        .enum(["stripe", "app_store", "play_store", "amazon", "promotional", "other"])
        .nullable(),
      status: z.string(),
      product_id: z.string().nullable(),
      current_period_end: z.string().nullable(),
      cancel_at_period_end: z.boolean(),
      grace_period_ends_at: z.string().nullable(),
      grants_pro: z.boolean(),
    })
    .nullable(),
  /** Where to change it: the Stripe portal, or the store it was bought in. */
  manage_in: z.enum(["stripe_portal", "app_store", "play_store", "amazon"]).nullable(),
  /** A renewal payment failed and the store/Stripe is retrying: ask for a new card. */
  payment_issue: z.boolean(),
});
export type BillingStatus = z.infer<typeof billingStatusSchema>;
