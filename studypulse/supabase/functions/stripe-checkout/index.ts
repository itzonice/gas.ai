// POST /stripe-checkout  { "interval": "monthly" | "yearly", "student"?: true, "promoCode"?: "FALL20" }
//   ->  { "url": "https://checkout.stripe.com/..." }
// Starts a Stripe Checkout for StudyPulse Pro. The client redirects to the returned URL;
// the subscription itself is recorded by the Stripe webhook, never by this endpoint.
// Users who already have an active subscription (on any platform) get 409 and should
// manage it instead (stripe-portal, or the App Store / Play Store for mobile purchases).
//
// Discounts:
// - student: true -> requires a confirmed academic email; mints a single-use code for the
//   student coupon, restricted to this customer (so it can't be shared), and applies it.
// - promoCode -> looked up server-side; codes tagged student_only need an academic email.
// - neither -> the Checkout page shows a promo code field.
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  checkoutInputSchema,
  createCheckoutSession,
  createCustomerPromotionCode,
  findPromotionCode,
  isAcademicEmail,
  isStudentOnlyPromotion,
  STUDENT_CODE_TTL_MS,
  type StripeOptions,
} from "@studypulse/core/billing/index.ts";

import { appUrl, getOrCreateStripeCustomer, stripeOptions } from "../_shared/billing.ts";
import { env } from "../_shared/env.ts";
import { createHandler } from "../_shared/handler.ts";
import { HttpError, json, parseJsonBody, requireMethod } from "../_shared/http.ts";
import { adminClient, requireUser, type AuthedUser } from "../_shared/supabase.ts";

function requireStudent(user: AuthedUser): void {
  const extra = (env().STUDENT_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  if (!user.email || !user.emailConfirmed || !isAcademicEmail(user.email, extra)) {
    throw new HttpError(
      403,
      "student_email_required",
      "The student discount needs a confirmed school email address (like you@school.edu)",
    );
  }
}

/** The promotion code to pre-apply, or undefined to let the user type one at Checkout. */
async function discountFor(
  input: { student?: boolean | undefined; promoCode?: string | undefined },
  user: AuthedUser,
  customerId: string,
  options: StripeOptions,
): Promise<string | undefined> {
  if (input.student) {
    requireStudent(user);
    const couponId = env().STRIPE_STUDENT_COUPON_ID;
    if (!couponId)
      throw new HttpError(503, "billing_not_configured", "Student pricing isn't available");
    const day = new Date().toISOString().slice(0, 10);
    const code = await createCustomerPromotionCode(
      {
        couponId,
        customerId,
        expiresAt: new Date(Date.now() + STUDENT_CODE_TTL_MS),
        metadata: { kind: "student", user_id: user.id },
        idempotencyKey: `student-${user.id}-${day}`,
      },
      options,
    );
    return code.id;
  }
  if (input.promoCode) {
    const promo = await findPromotionCode(input.promoCode, options);
    const invalid = new HttpError(400, "invalid_promo_code", "That promo code isn't valid");
    if (!promo?.active || (promo.customerId && promo.customerId !== customerId)) throw invalid;
    if (isStudentOnlyPromotion(promo.metadata)) requireStudent(user);
    return promo.id;
  }
  return undefined;
}

Deno.serve(
  createHandler("stripe-checkout", async (req, { log }) => {
    requireMethod(req, "POST");
    const user = await requireUser(req);
    const input = await parseJsonBody(req, checkoutInputSchema);
    const { interval } = input;
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
    const promotionCodeId = await discountFor(input, user, customerId, options);
    // Same key for repeat clicks within a minute: Stripe returns the same session.
    const minute = Math.floor(Date.now() / 60_000);
    const session = await createCheckoutSession(
      {
        userId: user.id,
        customerId,
        priceId,
        successUrl: `${origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${origin}/billing`,
        idempotencyKey: `checkout-${user.id}-${interval}-${promotionCodeId ?? "none"}-${String(minute)}`,
        ...(promotionCodeId ? { promotionCodeId } : {}),
      },
      options,
    );
    log.info("checkout started", {
      session_id: session.id,
      interval,
      discount: input.student ? "student" : input.promoCode ? "promo_code" : "none",
    });
    return json({ url: session.url });
  }),
);
