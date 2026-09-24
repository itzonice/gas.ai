// POST /delete-account   body: { "confirm": "DELETE" }
// Permanently deletes the caller's account: their stored files first, then the auth
// user, which cascades to every row they own (pinned by 230_account_deletion.test.sql).
// Safe to retry: if file removal fails nothing else is deleted; if the user deletion
// fails the files are already gone and a retry finishes the job.
import { z } from "zod";

import { createHandler } from "../_shared/handler.ts";
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

    // Billing: app-store subscriptions are managed (and must be cancelled) by the store;
    // Stripe subscriptions are cancelled here once billing exists (payments prompts).
    const files = await removeUserFolder(db, "syllabi", user.id);

    const { error } = await db.auth.admin.deleteUser(user.id);
    if (error) throw error;

    // Log only a count, never the email.
    log.info("account deleted", { user_id: user.id, files_removed: files });
    return json({ deleted: true });
  }),
);
