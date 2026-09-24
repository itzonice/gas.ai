// POST /stripe-webhook   (Stripe calls this; configure the endpoint in the Stripe dashboard)
// Verifies the Stripe-Signature header against the raw body, maps subscription events,
// and applies them with apply_billing_event, which is idempotent on the event id and
// ignores events older than the stored state.
// Responses: 2xx = done (including duplicates and ignored types); 400 = bad signature or
// body (Stripe won't fix it by retrying); 5xx = our failure, so Stripe retries.
import {
  stripeEventAction,
  stripeEventSchema,
  StripeSignatureError,
  verifyStripeSignature,
} from "@studypulse/core/billing/index.ts";

import { env } from "../_shared/env.ts";
import { createHandler } from "../_shared/handler.ts";
import { HttpError, json, requireMethod } from "../_shared/http.ts";
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
    const { data: result, error } = await adminClient().rpc("apply_billing_event", {
      p_provider: "stripe",
      p_event_id: event.id,
      p_event_type: event.type,
      p_event_created_at: new Date(event.created * 1000).toISOString(),
      ...(action.kind === "subscription" ? { p_subscription: { ...action.update } } : {}),
    });
    if (error) throw error;

    const fields = { event_id: event.id, type: event.type, result };
    if (result === "unknown_user") log.error("stripe event for an unknown user", fields);
    else log.info("stripe event processed", fields);
    return json({ received: true, result });
  }),
);
