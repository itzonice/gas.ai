// POST /stripe-webhook   (Stripe calls this; configure the endpoint in the Stripe dashboard)
// Verifies the Stripe-Signature header against the raw body, maps subscription events
// (and full refunds, which cancel the subscription and end access), and applies them
// with apply_billing_event, which is idempotent on the event id and
// ignores events older than the stored state.
// Responses: 2xx = done (including duplicates and ignored types); 400 = bad signature or
// body (Stripe won't fix it by retrying); 5xx = our failure, so Stripe retries.
import {
  billingEmailFromEvent,
  buildDisputeEvidence,
  cancelStripeSubscription,
  disputeRate,
  formatDisputeAlert,
  refundStripeCharge,
  retrieveStripeCharge,
  stageDisputeEvidence,
  stripeEventAction,
  stripeEventSchema,
  StripeSignatureError,
  subscriptionForCharge,
  verifyStripeSignature,
  type DisputeEvidence,
  type StripeDispute,
  type SubscriptionUpdate,
} from "@studypulse/core/billing/index.ts";
import { DEFAULT_WEB_ORIGIN, supportEmail } from "@studypulse/core/legal/index.ts";
import type { Logger } from "@studypulse/core/observability/index.ts";
import { sendResendBatch } from "@studypulse/core/notify/index.ts";

import { z } from "zod";

import { alertOwner } from "../_shared/alerts.ts";
import { stripeOptions } from "../_shared/billing.ts";
import { env } from "../_shared/env.ts";
import { createHandler } from "../_shared/handler.ts";
import { HttpError, json, requireMethod } from "../_shared/http.ts";
import { providerFetch } from "../_shared/resilience.ts";
import { adminClient } from "../_shared/supabase.ts";

const MAX_BODY_BYTES = 1_000_000;

Deno.serve(
  createHandler("stripe-webhook", async (req, { log }) => {
    requireMethod(req, "POST");
    const secret = env().STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new HttpError(503, "billing_not_configured", "Webhook not configured");

    const payload = await req.text();
    if (payload.length > MAX_BODY_BYTES) throw new HttpError(413, "payload_too_large");
    try {
      await verifyStripeSignature(payload, req.headers.get("stripe-signature"), secret);
    } catch (error) {
      if (error instanceof StripeSignatureError) {
        throw new HttpError(400, "invalid_signature", error.message);
      }
      throw error;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(payload);
    } catch {
      throw new HttpError(400, "invalid_json", "Body is not JSON");
    }
    const parsed = stripeEventSchema.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, "invalid_event", "Not a Stripe event");
    const event = parsed.data;

    const action = stripeEventAction(event);
    const at = new Date(event.created * 1000).toISOString();
    let update: Partial<SubscriptionUpdate> | null = null;
    if (action.kind === "subscription") {
      update = action.update;
    } else if (action.kind === "refund") {
      // A full refund ends access and billing. Cancel at Stripe first: if recording then
      // fails, Stripe retries this event and the cancel is a no-op.
      const options = stripeOptions();
      const subscriptionId = await subscriptionForCharge(action.charge, options);
      if (subscriptionId) {
        await cancelStripeSubscription(subscriptionId, options);
        update = { provider_subscription_id: subscriptionId, status: "refunded", canceled_at: at };
      }
    } else if (action.kind === "dispute") {
      // S20: gather evidence, stage it on the dispute (not submitted), record, alert.
      await handleDispute(action.dispute, log);
    } else if (action.kind === "fraud_warning") {
      // S20: refund before the card holder disputes it; charge.refunded then ends Pro.
      const chargeId =
        typeof action.warning.charge === "string"
          ? action.warning.charge
          : action.warning.charge.id;
      const refundId = await refundStripeCharge(
        chargeId,
        `efw-refund-${action.warning.id}`,
        stripeOptions(),
      );
      await alertOwner(
        "early fraud warning",
        `Radar early fraud warning ${action.warning.id} on ${chargeId}: refunded automatically (${refundId}).`,
        log,
        { warning: action.warning.id, charge: chargeId, refund: refundId },
      );
    }
    const { data: result, error } = await adminClient().rpc("apply_billing_event", {
      p_provider: "stripe",
      p_event_id: event.id,
      p_event_type: event.type,
      p_event_created_at: at,
      ...(update ? { p_subscription: { ...update } } : {}),
    });
    if (error) throw error;

    // Confirmation on a new subscription, and a reminder before yearly renewals (S16).
    // Resend's idempotency key is the event id, so Stripe's retries never send twice.
    const e = env();
    const email =
      result === "duplicate"
        ? null
        : billingEmailFromEvent(event, {
            ...(e.APP_URL ? { appUrl: e.APP_URL.replace(/\/+$/, "") } : {}),
            supportEmail: supportEmail(e.SUPPORT_EMAIL),
          });
    if (email && e.RESEND_API_KEY && e.EMAIL_FROM) {
      await sendResendBatch(
        [
          {
            from: e.EMAIL_FROM,
            to: [email.to],
            subject: email.subject,
            html: email.html,
            text: email.text,
            tags: [{ name: "kind", value: email.kind }],
          },
        ],
        `billing-email:${event.id}`,
        {
          apiKey: e.RESEND_API_KEY,
          ...(e.RESEND_API_URL ? { baseUrl: e.RESEND_API_URL } : {}),
          fetch: providerFetch("resend"),
        },
      );
      log.info("billing email sent", { event_id: event.id, kind: email.kind });
    } else if (email) {
      log.warn("billing email not sent: email isn't configured", { kind: email.kind });
    }

    const fields = { event_id: event.id, type: event.type, result };
    if (result === "unknown_user") log.error("stripe event for an unknown user", fields);
    else log.info("stripe event processed", fields);
    return json({ received: true, result });
  }),
);

const disputeCountsSchema = z.object({
  new: z.boolean(),
  disputes: z.number().int(),
  charges: z.number().int(),
});

async function handleDispute(dispute: StripeDispute, log: Logger): Promise<void> {
  const options = stripeOptions();
  const db = adminClient();
  const e = env();
  const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;
  const charge = await retrieveStripeCharge(chargeId, options);
  const customerId =
    typeof charge.customer === "string" ? charge.customer : (charge.customer?.id ?? null);
  let userId: string | null = null;
  if (customerId) {
    const { data, error } = await db
      .from("billing_customers")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (error) throw error;
    userId = data?.user_id ?? null;
  }

  let evidence: DisputeEvidence | null = null;
  if (userId) {
    const { data, error } = await db.rpc("dispute_evidence_facts", { p_user_id: userId });
    if (error) throw error;
    const facts = evidenceFactsSchema.parse(data);
    evidence = buildDisputeEvidence({
      ...facts,
      appUrl: (e.APP_URL ?? DEFAULT_WEB_ORIGIN).replace(/\/+$/, ""),
      chargeCreated: charge.created,
    });
    await stageDisputeEvidence(dispute.id, evidence, options);
  }

  const { data: counts, error } = await db.rpc("record_dispute", {
    p_dispute_id: dispute.id,
    p_charge_id: chargeId,
    ...(userId ? { p_user_id: userId } : {}),
    p_amount_cents: dispute.amount,
    p_currency: dispute.currency,
    p_reason: dispute.reason,
    ...(dispute.evidence_details?.due_by
      ? { p_evidence_due_by: new Date(dispute.evidence_details.due_by * 1000).toISOString() }
      : {}),
    ...(evidence ? { p_evidence: evidence as Record<string, string> } : {}),
  });
  if (error) throw error;
  const parsed = disputeCountsSchema.parse(counts);
  if (!parsed.new) return; // a Stripe retry: already alerted
  const rate = disputeRate(parsed.disputes, parsed.charges);
  await alertOwner(
    rate.overThreshold ? "dispute rate above 0.5%" : "new dispute",
    formatDisputeAlert({
      disputeId: dispute.id,
      amountCents: dispute.amount,
      currency: dispute.currency,
      reason: dispute.reason,
      dueBy: dispute.evidence_details?.due_by ?? null,
      userId,
      rate,
    }),
    log,
    { dispute: dispute.id, user_id: userId, ...rate },
  );
}

const evidenceFactsSchema = z.object({
  email: z.string().nullable(),
  name: z.string().nullable(),
  termsAcceptances: z.array(
    z.object({ version: z.string(), context: z.string(), accepted_at: z.string() }),
  ),
  signIns: z.array(z.object({ at: z.string(), user_agent: z.string().nullable() })),
  usage: z.object({
    courses: z.number(),
    uploads: z.number(),
    study_sessions: z.number(),
    study_minutes: z.number(),
    first_active_at: z.string().nullable(),
    last_active_at: z.string().nullable(),
  }),
});
