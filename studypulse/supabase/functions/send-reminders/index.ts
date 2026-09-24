// Scheduled every 15 minutes by pg_cron. Sends due reminders by push, in each user's
// timezone, and logs every send:
// 1. checks Expo receipts from earlier runs (dead tokens are invalidated)
// 2. pages through users with active push tokens (reminder_batch)
// 3. plans reminders with the core rules, claims them (dedupe, daily cap, and a
//    per-assignment cooldown, atomically, so overlapping runs can't double-send or
//    exceed the cap), sends to each active Expo device, and logs one row per device
import {
  isDeadToken,
  planReminders,
  sendExpoPush,
  type ExpoMessage,
  type PlannedReminder,
} from "@studypulse/core/notify/index.ts";
import { z } from "zod";

import { requireCron } from "../_shared/cron.ts";
import { createHandler } from "../_shared/handler.ts";
import { json, requireMethod } from "../_shared/http.ts";
import { expoOptions } from "../_shared/push/options.ts";
import { checkExpoReceipts } from "../_shared/push/receipts.ts";
import { adminClient } from "../_shared/supabase.ts";

const PAGE_SIZE = 500;
const TIME_BUDGET_MS = 100_000;

const prefsSchema = z.object({
  push_enabled: z.boolean(),
  remind_24h: z.boolean(),
  remind_2h: z.boolean(),
  exam_countdown: z.boolean(),
  morning_digest: z.boolean(),
  morning_digest_time: z.string(),
  quiet_hours_enabled: z.boolean(),
  quiet_hours_start: z.string(),
  quiet_hours_end: z.string(),
  daily_cap: z.number().int(),
});
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

interface Outgoing {
  userId: string;
  tokenId: string;
  reminder: PlannedReminder;
  message: ExpoMessage;
}

Deno.serve(
  createHandler("send-reminders", async (req, { log }) => {
    requireMethod(req, "POST");
    requireCron(req);
    const started = Date.now();
    const db = adminClient();
    const now = new Date();

    const receipts = await checkExpoReceipts(db, log).catch((error: unknown) => {
      log.warn("receipt check failed", { error });
      return { checked: 0, invalidated: 0 };
    });

    const totals = { users: 0, planned: 0, sent: 0, failed: 0, dead_tokens: 0 };
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
      const { data: users, error } = await db.rpc("reminder_batch", pageArgs);
      if (error) throw error;
      if (!users.length) break;
      after = users[users.length - 1]?.user_id ?? null;
      totals.users += users.length;

      const { data: tokens, error: tokenError } = await db
        .from("notification_tokens")
        .select("id, user_id, token")
        .in(
          "user_id",
          users.map((u) => u.user_id),
        )
        .eq("provider", "expo")
        .is("invalidated_at", null);
      if (tokenError) throw tokenError;

      const outgoing: Outgoing[] = [];
      for (const user of users) {
        const prefs = prefsSchema.safeParse(user.prefs);
        const assignments = assignmentsSchema.safeParse(user.assignments);
        if (!prefs.success || !assignments.success) {
          log.error("bad reminder data", { user_id: user.user_id });
          continue;
        }
        const planned = planReminders({
          timezone: user.timezone,
          now,
          prefs: prefs.data,
          assignments: assignments.data,
        });
        if (!planned.length) continue;
        totals.planned += planned.length;

        const { data: won, error: claimError } = await db.rpc("claim_reminders", {
          p_user_id: user.user_id,
          p_timezone: user.timezone,
          p_daily_cap: prefs.data.daily_cap,
          p_reminders: planned.map((p) => ({
            key: p.dedupeKey,
            kind: p.kind,
            assignmentId: p.assignmentId,
          })),
        });
        if (claimError) throw claimError;
        const claimed = new Set(won);
        for (const reminder of planned.filter((p) => claimed.has(p.dedupeKey))) {
          for (const t of tokens.filter((x) => x.user_id === user.user_id)) {
            outgoing.push({
              userId: user.user_id,
              tokenId: t.id,
              reminder,
              message: {
                to: t.token,
                title: reminder.title,
                body: reminder.body,
                sound: "default",
                priority: "high",
                data: { kind: reminder.kind, assignmentId: reminder.assignmentId },
              },
            });
          }
        }
      }
      if (!outgoing.length) continue;

      let tickets;
      try {
        tickets = await sendExpoPush(
          outgoing.map((o) => o.message),
          expoOptions(),
        );
      } catch (sendError) {
        // Release this page's claims so the next run retries them.
        log.error("expo send failed", { error: sendError });
        for (const userId of new Set(outgoing.map((o) => o.userId))) {
          await db
            .from("notification_dedupe")
            .delete()
            .eq("user_id", userId)
            .in(
              "dedupe_key",
              outgoing.filter((o) => o.userId === userId).map((o) => o.reminder.dedupeKey),
            );
        }
        totals.failed += outgoing.length;
        continue;
      }

      const rows = outgoing.map((o, i) => {
        const ticket = tickets[i];
        const ok = ticket?.status === "ok";
        return {
          user_id: o.userId,
          kind: o.reminder.kind,
          channel: "expo" as const,
          status: ok ? ("sent" as const) : ("failed" as const),
          assignment_id: o.reminder.assignmentId,
          token_id: o.tokenId,
          dedupe_key: o.reminder.dedupeKey,
          title: o.reminder.title,
          body: o.reminder.body,
          provider_message_id: ticket?.status === "ok" ? ticket.id : null,
          error: ticket?.status === "error" ? ticket.message.slice(0, 500) : null,
        };
      });
      const { error: logError } = await db.from("notification_log").insert(rows);
      if (logError) log.error("could not log sends", { error: logError.message });

      const dead = outgoing.filter((_, i) => {
        const ticket = tickets[i];
        return ticket !== undefined && isDeadToken(ticket);
      });
      if (dead.length) {
        await db.rpc("invalidate_push_tokens", { p_token_ids: dead.map((d) => d.tokenId) });
      }
      totals.sent += rows.filter((r) => r.status === "sent").length;
      totals.failed += rows.filter((r) => r.status === "failed").length;
      totals.dead_tokens += dead.length;
    }

    const summary = {
      ...totals,
      receipts_checked: receipts.checked,
      tokens_invalidated_by_receipts: receipts.invalidated,
    };
    log.info("reminders run finished", summary);
    return json(summary);
  }),
);
