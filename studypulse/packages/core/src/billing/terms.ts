// The words shown next to every subscribe button and in every billing email (launch
// safety S16): the price, how often it's charged, that it renews until canceled, and how
// to cancel. One source, so the page, the store paywall, and the emails always agree.
import { z } from "zod";

import type { BillingInterval } from "./plans.ts";

export const displayPriceSchema = z.object({
  amount_cents: z.number().int().nonnegative(),
  currency: z.string().regex(/^[a-z]{3}$/),
});
export type DisplayPrice = z.infer<typeof displayPriceSchema>;

/** GET /stripe-checkout: the current web prices (null if a plan isn't configured). */
export const pricesResponseSchema = z.object({
  monthly: displayPriceSchema.nullable(),
  yearly: displayPriceSchema.nullable(),
});
export type PricesResponse = z.infer<typeof pricesResponseSchema>;

export function formatPrice(price: DisplayPrice, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: price.currency.toUpperCase(),
  }).format(price.amount_cents / 100);
}

export const CANCEL_INSTRUCTIONS =
  "Cancel anytime in Settings → Manage subscription (or in your App Store or Google Play " +
  "subscriptions if you bought Pro there). You keep Pro until the end of the period you paid for.";

export interface SubscriptionTerms {
  /** "$4.99 / month", or null when the price isn't known (then it's shown at checkout). */
  price: string | null;
  /** "Billed every month" / "Billed once a year". */
  frequency: string;
  /** "Renews automatically every month until you cancel." */
  renewal: string;
  cancel: string;
}

export function subscriptionTerms(
  interval: BillingInterval,
  price: DisplayPrice | null,
): SubscriptionTerms {
  const unit = interval === "monthly" ? "month" : "year";
  return {
    price: price ? `${formatPrice(price)} / ${unit}` : null,
    frequency: interval === "monthly" ? "Billed every month" : "Billed once a year",
    renewal: `Renews automatically every ${unit} until you cancel.`,
    cancel: CANCEL_INSTRUCTIONS,
  };
}
