// POST /delete-account   body: { "confirm": "DELETE" }
// Permanently deletes the caller's account, in an order that is safe to retry:
// 1. Stripe: deletes the customer, which cancels web subscriptions immediately, so a
//    deleted account is never billed again. If this fails, nothing else is deleted.
//    (App Store / Play subscriptions can only be cancelled by the user in the store.)
// 2. Canvas: revokes access tokens at each school's Canvas (best effort).
// 3. Stored files, then the auth user, which cascades to every row they own (pinned by
//    230_account_deletion.test.sql) and removes their Vault secrets.
import { deleteStripeCustomer } from "@studypulse/core/billing/index.ts";
import { revokeCanvasToken } from "@studypulse/core/lms/index.ts";
import { z } from "zod";

import { createHandler } from "../_shared/handler.ts";
import { findStripeCustomer, stripeOptions } from "../_shared/billing.ts";
import { json, parseJsonBody, requireMethod } from "../_shared/http.ts";
import { removeUserFolder } from "../_shared/storage.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

const bodySchema = z.object({
  confirm: z.literal("DELETE", { message: 'Send { "confirm": "DELETE" } to delete your account' }),
});

Deno.serve(
  createHandler("delete-account", async (req, { log }) => {
    requireMethod(req, "POST");
    const user = await requireUser(req);
    await parseJsonBody(req, bodySchema);
    const db = adminClient();

    // 1. Stop web billing first. stripeOptions() throws 503 if Stripe isn't configured,
    //    so an account with a Stripe customer is never deleted while billing continues.
    const customerId = await findStripeCustomer(db, user.id);
    if (customerId) await deleteStripeCustomer(customerId, stripeOptions());

    // 2. Revoke Canvas access (best effort: the tokens are deleted from Vault regardless).
    const { data: connections } = await db
      .from("lms_connections")
      .select("id")
      .eq("user_id", user.id);
    let canvasRevoked = 0;
    for (const c of connections ?? []) {
      const { data: creds } = await db.rpc("lms_connection_credentials", {
        p_connection_id: c.id,
      });
      const cred = creds?.[0];
      if (cred?.base_url && cred.access_token) {
        const ok = await revokeCanvasToken(cred.base_url, cred.access_token).catch(() => false);
        if (ok) canvasRevoked++;
      }
    }

    // 3. Files, then the user (cascades everything else).
    const files = await removeUserFolder(db, "syllabi", user.id);

    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;

    // Log only a count, never the email.
    log.info("account deleted", {
      user_id: user.id,
      files_removed: files,
      stripe_customer_deleted: Boolean(customerId),
      canvas_tokens_revoked: canvasRevoked,
    });
    return json({ deleted: true });
  }),
);
