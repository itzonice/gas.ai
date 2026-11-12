// POST /revenuecat-webhook   (RevenueCat calls this for iOS and Android purchases)
// RevenueCat authenticates with a fixed Authorization header we choose in its dashboard
// (REVENUECAT_WEBHOOK_AUTH). Events map to our subscription states and go through
// apply_billing_event: idempotent on the event id, older events never overwrite newer
// state, and profiles.plan_tier follows.
// Responses: 200 = done (including duplicates and ignored events); 401 = bad auth;
// 400 = bad body; 5xx = our failure, so RevenueCat retries.
import { revenueCatEventAction, revenueCatWebhookSchema } from "@studypulse/core/billing/index.ts";

import { safeEqual } from "../_shared/cron.ts";
import { env } from "../_shared/env.ts";
import { createHandler } from "../_shared/handler.ts";
import { HttpError, json, parseJsonBody, requireMethod } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

Deno.serve(
  createHandler("revenuecat-webhook", async (req, { log }) => {
    requireMethod(req, "POST");
    const expected = env().REVENUECAT_WEBHOOK_AUTH;
    if (!expected) throw new HttpError(503, "billing_not_configured", "Webhook not configured");
    const given = req.headers.get("authorization") ?? "";
    // Accept the bare value or "Bearer <value>", whichever the dashboard was given.
    const token = given.startsWith("Bearer ") ? given.slice(7) : given;
    if (!safeEqual(token, expected)) throw new HttpError(401, "unauthorized");

    const { event } = await parseJsonBody(req, revenueCatWebhookSchema);
    const action = revenueCatEventAction(event);
    const { data: result, error } = await adminClient().rpc("apply_billing_event", {
      p_provider: "revenuecat",
      p_event_id: event.id,
      p_event_type: event.type,
      p_event_created_at: new Date(event.event_timestamp_ms).toISOString(),
      ...(action.kind === "subscription" ? { p_subscription: { ...action.update } } : {}),
    });
    if (error) throw error;

    const fields = {
      event_id: event.id,
      type: event.type,
      store: event.store,
      environment: event.environment,
      result,
      ...(action.kind === "ignore" ? { reason: action.reason } : {}),
    };
    if (result === "unknown_user") log.error("revenuecat event for an unknown user", fields);
    else log.info("revenuecat event processed", fields);
    return json({ received: true, result });
  }),
);
