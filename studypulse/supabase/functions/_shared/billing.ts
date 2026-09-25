import { createStripeCustomer, type StripeOptions } from "@studypulse/core/billing/index.ts";

import { env } from "./env.ts";
import { HttpError } from "./http.ts";
import { providerFetch } from "./resilience.ts";
import type { AdminClient, AuthedUser } from "./supabase.ts";

/** Stripe client options, or 503 if billing isn't configured in this environment. */
export function stripeOptions(): StripeOptions {
  const e = env();
  if (!e.STRIPE_SECRET_KEY) {
    throw new HttpError(503, "billing_not_configured", "Billing is not available right now");
  }
  return {
    apiKey: e.STRIPE_SECRET_KEY,
    ...(e.STRIPE_API_URL ? { baseUrl: e.STRIPE_API_URL } : {}),
    ...(e.STRIPE_API_VERSION ? { apiVersion: e.STRIPE_API_VERSION } : {}),
    fetch: providerFetch("stripe"),
  };
}

/** The web app origin for Stripe redirects (APP_URL), or 503 if unset. */
export function appUrl(): string {
  const url = env().APP_URL;
  if (!url)
    throw new HttpError(503, "billing_not_configured", "Billing is not available right now");
  return url.replace(/\/+$/, "");
}

export async function findStripeCustomer(db: AdminClient, userId: string): Promise<string | null> {
  const { data, error } = await db
    .from("billing_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.stripe_customer_id ?? null;
}

/**
 * The user's Stripe customer, created on first use. Stripe's idempotency key (per user)
 * makes concurrent first calls return the same customer; the insert ignores the loser.
 */
export async function getOrCreateStripeCustomer(
  db: AdminClient,
  user: AuthedUser,
  options: StripeOptions,
): Promise<string> {
  const existing = await findStripeCustomer(db, user.id);
  if (existing) return existing;
  const customerId = await createStripeCustomer({ userId: user.id, email: user.email }, options);
  const { error } = await db
    .from("billing_customers")
    .upsert(
      { user_id: user.id, stripe_customer_id: customerId },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  if (error) throw error;
  return (await findStripeCustomer(db, user.id)) ?? customerId;
}
