// POST /stripe-checkout  { "interval": "monthly" | "yearly" }  ->  { "url": "https://checkout.stripe.com/..." }
// Starts a Stripe Checkout for StudyPulse Pro. The client redirects to the returned URL;
// the subscription itself is recorded by the Stripe webhook, never by this endpoint.
// Users who already have an active subscription (on any platform) get 409 and should
// manage it instead (stripe-portal, or the App Store / Play Store for mobile purchases).
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  checkoutInputSchema,
  createCheckoutSession,
} from "@studypulse/core/billing/index.ts";

import { appUrl, getOrCreateStripeCustomer, stripeOptions } from "../_shared/billing.ts";
import { env } from "../_shared/env.ts";
import { createHandler } from "../_shared/handler.ts";
import { HttpError, json, parseJsonBody, requireMethod } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

Deno.serve(
  createHandler("stripe-checkout", async (req, { log }) => {
    requireMethod(req, "POST");
    const user = await requireUser(req);
    const { interval } = await parseJsonBody(req, checkoutInputSchema);
    const options = stripeOptions();
    const origin = appUrl();
    const e = env();
    const priceId = interval === "monthly" ? e.STRIPE_PRICE_MONTHLY : e.STRIPE_PRICE_YEARLY;
    if (!priceId) throw new HttpError(503, "billing_not_configured", "This plan isn't available");

    const db = adminClient();
    const { data: active, error } = await db
      .from("subscriptions")
      .select("provider")
      .eq("user_id", user.id)
      .in("status", [...ACTIVE_SUBSCRIPTION_STATUSES])
      .limit(1);
    if (error) throw error;
    if (active.length) {
      throw new HttpError(409, "already_subscribed", "You already have StudyPulse Pro", {
        provider: active[0]?.provider,
      });
    }

    const customerId = await getOrCreateStripeCustomer(db, user, options);
    // Same key for repeat clicks within a minute: Stripe returns the same session.
    const minute = Math.floor(Date.now() / 60_000);
    const session = await createCheckoutSession(
      {
        userId: user.id,
        customerId,
        priceId,
        successUrl: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/billing`,
        idempotencyKey: `checkout-${user.id}-${interval}-${String(minute)}`,
      },
      options,
    );
    log.info("checkout started", { session_id: session.id, interval });
    return json({ url: session.url });
  }),
);
