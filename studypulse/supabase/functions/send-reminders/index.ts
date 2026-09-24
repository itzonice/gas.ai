// Scheduled every 15 minutes by pg_cron. Sends due reminders by push, in each user's
// timezone, and logs every send:
// 1. checks Expo receipts from earlier runs (dead tokens are invalidated)
// 2. pages through users with active push tokens (reminder_batch)
// 3. plans reminders with the core rules, claims them (dedupe, daily cap, and a
//    per-assignment cooldown, atomically, so overlapping runs can't double-send or
//    exceed the cap), sends them, and logs one row per device
// Channels: every active Expo device; web push (VAPID) is the fallback for users
// with no Expo device. Dead Expo tokens and expired web subscriptions are invalidated.
import {
  isDeadToken,
  planReminders,
  sendExpoPush,
  sendWebPush,
  type ExpoMessage,
  type PlannedReminder,
  type VapidKeys,
  type WebPushSubscription,
} from "@studypulse/core/notify/index.ts";
import type { Logger } from "@studypulse/core/observability/index.ts";
import { z } from "zod";

import { requireCron } from "../_shared/cron.ts";
import { createHandler } from "../_shared/handler.ts";
import { json, requireMethod } from "../_shared/http.ts";
import { expoOptions, vapidKeys } from "../_shared/push/options.ts";
import { checkExpoReceipts } from "../_shared/push/receipts.ts";
import { adminClient } from "../_shared/supabase.ts";

const PAGE_SIZE = 500;
const TIME_BUDGET_MS = 100_000;
const WEB_PUSH_CONCURRENCY = 20;

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

const webPushKeysSchema = z.object({ p256dh: z.string(), auth: z.string() });

interface Outgoing {
  userId: string;
  tokenId: string;
  reminder: PlannedReminder;
}
interface ExpoOutgoing extends Outgoing {
  message: ExpoMessage;
}
interface WebOutgoing extends Outgoing {
  subscription: WebPushSubscription;
}

interface Token {
  id: string;
  user_id: string;
  token: string;
  provider: "expo" | "web_push";
  web_push_keys: unknown;
}

/** Expo devices if the user has any; otherwise web push subscriptions (the fallback). */
function deliveryTargets(tokens: readonly Token[], vapid: VapidKeys | null) {
  const expo = tokens.filter((t) => t.provider === "expo");
  const web: { tokenId: string; subscription: WebPushSubscription }[] = [];
  if (!expo.length && vapid) {
    for (const t of tokens.filter((x) => x.provider === "web_push")) {
      const keys = webPushKeysSchema.safeParse(t.web_push_keys);
      if (keys.success)
        web.push({ tokenId: t.id, subscription: { endpoint: t.token, ...keys.data } });
    }
  }
  return { expo, web };
}

/** Runs `fn` over `items` with at most `limit` in flight; results keep input order. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Sends web push reminders, logs each send, and invalidates expired subscriptions. */
async function sendWebReminders(
  db: ReturnType<typeof adminClient>,
  items: readonly WebOutgoing[],
  vapid: VapidKeys,
  log: Logger,
) {
  const results = await mapLimit(items, WEB_PUSH_CONCURRENCY, (o) =>
    sendWebPush(
      o.subscription,
      {
        title: o.reminder.title,
        body: o.reminder.body,
        url: o.reminder.assignmentId ? `/assignments/${o.reminder.assignmentId}` : "/today",
        tag: o.reminder.dedupeKey,
        data: { kind: o.reminder.kind, assignmentId: o.reminder.assignmentId },
      },
      { vapid },
    ),
  );
  const rows = items.map((o, i) => {
    const r = results[i];
    return {
      user_id: o.userId,
      kind: o.reminder.kind,
      channel: "web_push" as const,
      status: r?.ok ? ("sent" as const) : ("failed" as const),
      assignment_id: o.reminder.assignmentId,
      token_id: o.tokenId,
      dedupe_key: o.reminder.dedupeKey,
      title: o.reminder.title,
      body: o.reminder.body,
      provider_message_id: r?.ok ? r.messageId : null,
      error: r && !r.ok ? `${String(r.status)}: ${r.message}`.slice(0, 500) : null,
    };
  });
  const { error: logError } = await db.from("notification_log").insert(rows);
  if (logError) log.error("could not log web pushes", { error: logError.message });

  const dead = items.filter((_, i) => {
    const r = results[i];
    return r !== undefined && !r.ok && r.gone;
  });
  const deadIds = [...new Set(dead.map((d) => d.tokenId))];
  if (deadIds.length) await db.rpc("invalidate_push_tokens", { p_token_ids: deadIds });
  const sent = rows.filter((r) => r.status === "sent").length;
  return { sent, failed: rows.length - sent, dead: deadIds.length };
}

Deno.serve(
  createHandler("send-reminders", async (req, { log }) => {
    requireMethod(req, "POST");
    requireCron(req);
    const started = Date.now();
    const db = adminClient();
    const now = new Date();
    const vapid = vapidKeys();

    const receipts = await checkExpoReceipts(db, log).catch((error: unknown) => {
      log.warn("receipt check failed", { error });
      return { checked: 0, invalidated: 0 };
    });

    const totals = { users: 0, planned: 0, sent: 0, web_sent: 0, failed: 0, dead_tokens: 0 };
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
        .select("id, user_id, token, provider, web_push_keys")
        .in(
          "user_id",
          users.map((u) => u.user_id),
        )
        .is("invalidated_at", null);
      if (tokenError) throw tokenError;

      const outgoing: ExpoOutgoing[] = [];
      const webOutgoing: WebOutgoing[] = [];
      for (const user of users) {
        const targets = deliveryTargets(
          tokens.filter((t) => t.user_id === user.user_id),
          vapid,
        );
        // Nothing can reach this user (e.g. web-only while web push is unconfigured):
        // don't claim, so nothing is marked sent that never was.
        if (!targets.expo.length && !targets.web.length) continue;
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
          for (const w of targets.web) {
            webOutgoing.push({ userId: user.user_id, reminder, ...w });
          }
          for (const t of targets.expo) {
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
      if (webOutgoing.length && vapid) {
        const web = await sendWebReminders(db, webOutgoing, vapid, log);
        totals.web_sent += web.sent;
        totals.failed += web.failed;
        totals.dead_tokens += web.dead;
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
      const deadIds = [...new Set(dead.map((d) => d.tokenId))];
      if (deadIds.length) {
        await db.rpc("invalidate_push_tokens", { p_token_ids: deadIds });
      }
      totals.sent += rows.filter((r) => r.status === "sent").length;
      totals.failed += rows.filter((r) => r.status === "failed").length;
      totals.dead_tokens += deadIds.length;
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
