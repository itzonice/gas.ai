// POST /admin-refund  { "charge_id": "ch_...", "reason": "requested_by_customer",
//                       "amount_cents"?: 499, "note"?: "..." }  ->  { "refund_id": "re_..." }
// Admins only (S32): refunds a Stripe charge on a student's behalf. A full refund ends Pro
// immediately and a partial refund changes nothing; both happen when Stripe's
// charge.refunded webhook arrives (see /refunds). Each refund is logged with the admin who
// issued it, and retries with the same charge and amount can't refund twice.
import { refundStripeCharge } from "@studypulse/core/billing/index.ts";
import { z } from "zod";

import { stripeOptions } from "../_shared/billing.ts";
import { createHandler } from "../_shared/handler.ts";
import { json, parseJsonBody, requireMethod } from "../_shared/http.ts";
import { adminClient, requireAdmin } from "../_shared/supabase.ts";

const bodySchema = z
  .object({
    charge_id: z.string().regex(/^ch_[A-Za-z0-9]{8,64}$/, "a Stripe charge id (ch_...)"),
    reason: z.enum(["requested_by_customer", "duplicate", "fraudulent"]),
    amount_cents: z.number().int().positive().max(1_000_000).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();

Deno.serve(
  createHandler("admin-refund", async (req, { log }) => {
    requireMethod(req, "POST");
    const admin = await requireAdmin(req);
    const body = await parseJsonBody(req, bodySchema);
    const options = stripeOptions();

    const refundId = await refundStripeCharge(
      body.charge_id,
      `admin-refund:${body.charge_id}:${String(body.amount_cents ?? "full")}`,
      options,
      {
        reason: body.reason,
        ...(body.amount_cents === undefined ? {} : { amountCents: body.amount_cents }),
      },
    );

    const { error } = await adminClient().rpc("record_admin_action", {
      p_admin_id: admin.id,
      p_action: "refund",
      p_target_type: "stripe_charge",
      p_target_id: body.charge_id,
      p_details: {
        refund_id: refundId,
        reason: body.reason,
        amount_cents: body.amount_cents ?? null,
        note: body.note ?? null,
      },
    });
    // The refund already went through; a logging failure mustn't hide that.
    if (error) log.error("admin action not logged", { error, refund_id: refundId });
    log.info("admin refund", { admin_id: admin.id, refund_id: refundId });
    return json({ refund_id: refundId });
  }),
);
