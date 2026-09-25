// Scheduled every 15 minutes by pg_cron. Emails the daily digest (via Resend) to users
// push doesn't reach, at their digest time in their timezone:
// 1. email_digest_batch pages through users due a digest right now
// 2. planEmailDigest builds it (null when nothing is due this week)
// 3. claims it (one per local day, even if runs overlap), sends in batches of 100 with
//    an idempotency key, and logs every send. A failed batch releases its claims so the
//    next run retries it (within the 3-hour window).
import { encodeHex } from "jsr:@std/encoding@^1/hex";
import {
  planEmailDigest,
  RESEND_BATCH_SIZE,
  sendResendBatch,
  signUnsubscribeToken,
  type EmailDigest,
  type ResendEmail,
} from "@studypulse/core/notify/index.ts";
import { z } from "zod";

import { requireCron } from "../_shared/cron.ts";
import { env } from "../_shared/env.ts";
import { createHandler } from "../_shared/handler.ts";
import { json, requireMethod } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

/** Users per page (PostgREST returns at most 100 rows; launch safety S8). */
const PAGE_SIZE = 100;
const TIME_BUDGET_MS = 100_000;

const assignmentsSchema = z.array(
  z.object({
    id: z.string(),
    title: z.string(),
    course: z.string(),
    kind: z.string(),
    dueAt: z.string(),
    status: z.enum(["todo", "in_progress", "done", "skipped"]),
  }),
);

interface Pending {
  userId: string;
  digest: EmailDigest;
  email: ResendEmail;
}

async function sha256Hex(value: string): Promise<string> {
  return encodeHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  );
}

Deno.serve(
  createHandler("send-email-digests", async (req, { log }) => {
    requireMethod(req, "POST");
    requireCron(req);
    const e = env();
    if (!e.RESEND_API_KEY || !e.EMAIL_FROM || !e.EMAIL_UNSUBSCRIBE_SECRET) {
      log.warn(
        "email digest not configured (RESEND_API_KEY, EMAIL_FROM, EMAIL_UNSUBSCRIBE_SECRET)",
      );
      return json({ skipped: "not_configured" });
    }
    const resend = {
      apiKey: e.RESEND_API_KEY,
      ...(e.RESEND_API_URL ? { baseUrl: e.RESEND_API_URL } : {}),
    };
    const started = Date.now();
    const db = adminClient();
    const now = new Date();
    const appUrl = e.APP_URL?.replace(/\/+$/, "");
    const totals = { users: 0, sent: 0, failed: 0 };
    let after: string | null = null;

    for (;;) {
      if (Date.now() - started > TIME_BUDGET_MS) {
        log.warn("time budget reached; remaining users go next run");
        break;
      }
      const pageArgs: { p_now: string; p_limit: number; p_after?: string } = {
        p_now: now.toISOString(),
        p_limit: PAGE_SIZE,
        ...(after ? { p_after: after } : {}),
      };
      const { data: users, error } = await db.rpc("email_digest_batch", pageArgs);
      if (error) throw error;
      if (!users.length) break;
      after = users[users.length - 1]?.user_id ?? null;
      totals.users += users.length;

      const pending: Pending[] = [];
      for (const user of users) {
        const assignments = assignmentsSchema.safeParse(user.assignments);
        if (!assignments.success) {
          log.error("bad digest data", { user_id: user.user_id });
          continue;
        }
        const token = await signUnsubscribeToken(user.user_id, e.EMAIL_UNSUBSCRIBE_SECRET);
        const unsubscribeUrl = `${e.SUPABASE_URL}/functions/v1/email-unsubscribe?token=${token}`;
        const digest = planEmailDigest({
          timezone: user.timezone,
          now,
          prefs: { morning_digest_time: user.digest_time },
          assignments: assignments.data,
          name: user.display_name,
          unsubscribeUrl,
          ...(appUrl ? { appUrl } : {}),
        });
        if (!digest) continue;

        const { data: won, error: claimError } = await db.rpc("claim_reminders", {
          p_user_id: user.user_id,
          p_timezone: user.timezone,
          p_daily_cap: 1000, // the digest is one email a day; push caps don't apply
          p_reminders: [{ key: digest.dedupeKey, kind: "email_digest" }],
        });
        if (claimError) throw claimError;
        if (!won.includes(digest.dedupeKey)) continue;

        pending.push({
          userId: user.user_id,
          digest,
          email: {
            from: e.EMAIL_FROM,
            to: [user.email],
            subject: digest.subject,
            html: digest.html,
            text: digest.text,
            // RFC 8058 one-click unsubscribe (required by Gmail and Yahoo for bulk senders).
            headers: {
              "List-Unsubscribe": `<${unsubscribeUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
            tags: [{ name: "kind", value: "email_digest" }],
          },
        });
      }

      for (let i = 0; i < pending.length; i += RESEND_BATCH_SIZE) {
        const batch = pending.slice(i, i + RESEND_BATCH_SIZE);
        const key = await sha256Hex(
          batch.map((p) => `${p.userId}:${p.digest.dedupeKey}`).join(","),
        );
        let ids: string[] | null = null;
        let failure: string | null = null;
        try {
          ids = await sendResendBatch(
            batch.map((p) => p.email),
            `email-digest-${key}`,
            resend,
          );
        } catch (sendError) {
          failure = String(sendError).slice(0, 500);
          log.error("resend batch failed", { error: sendError, size: batch.length });
          // Release the claims so the next run retries.
          for (const p of batch) {
            await db
              .from("notification_dedupe")
              .delete()
              .eq("user_id", p.userId)
              .eq("dedupe_key", p.digest.dedupeKey);
          }
        }
        const { error: logError } = await db.from("notification_log").insert(
          batch.map((p, j) => ({
            user_id: p.userId,
            kind: "email_digest" as const,
            channel: "email" as const,
            status: ids ? ("sent" as const) : ("failed" as const),
            dedupe_key: p.digest.dedupeKey,
            title: p.digest.subject,
            provider_message_id: ids?.[j] ?? null,
            error: failure,
          })),
        );
        if (logError) log.error("could not log emails", { error: logError.message });
        if (ids) totals.sent += batch.length;
        else totals.failed += batch.length;
      }
    }

    log.info("email digest run finished", totals);
    return json(totals);
  }),
);
