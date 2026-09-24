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
