// Scheduled hourly by pg_cron. Each run:
// 1. marks ended planned blocks missed (or done, if study time covered them), for everyone
// 2. for users past 3 AM local time who haven't been replanned yet that local day
//    (claimed atomically, so each user is replanned at most once per local day, in any
//    UTC offset and across DST changes): re-ranks their open work and rebuilds their
//    plan (missed work is rescheduled; nothing is ever placed after its due time).
//    A failed or deferred replan releases its claim so a later run retries it that day.
// 3. records overloaded days as study_plan_alerts
//
// Body (optional, for manual runs): { "user_ids": [...] } to replan specific users now.
import { localDate } from "@studypulse/core/time/index.ts";
import { z } from "zod";

import { requireCron } from "../_shared/cron.ts";
import { createHandler } from "../_shared/handler.ts";
import { json, requireMethod } from "../_shared/http.ts";
import { replanUser } from "../_shared/planner.ts";
import { adminClient } from "../_shared/supabase.ts";
import { chunks } from "../_shared/chunks.ts";

const NIGHTLY_LOCAL_HOUR = 3;
/** Users claimed per round trip (PostgREST returns at most 100 rows; launch safety S8). */
const CLAIM_BATCH = 100;
const CONCURRENCY = 4;
/** Stop starting new users after this long so the run finishes inside the function limit. */
const TIME_BUDGET_MS = 110_000;

const bodySchema = z.object({ user_ids: z.array(z.uuid()).max(200).optional() }).default({});

Deno.serve(
  createHandler("nightly-replan", async (req, { log }) => {
    requireMethod(req, "POST");
    requireCron(req);
    const started = Date.now();
    const body = bodySchema.parse(await req.json().catch(() => ({})));
    const db = adminClient();
    const now = new Date();

    const { data: marked, error: markError } = await db.rpc("mark_missed_blocks", {
      p_before: now.toISOString(),
    });
    if (markError) throw markError;
    const missed = (marked ?? []).reduce((s, r) => s + r.missed, 0);

    // A claim (local date + the previous value) is released if the replan doesn't happen.
    type Claim = { local_date: string; previous_date: string | null };
    type User = { user_id: string; timezone: string } & Partial<Claim>;
    const release = async (u: User) => {
      if (!u.local_date) return;
      const { error } = await db.rpc("release_replan_claim", {
        p_user_id: u.user_id,
        p_local_date: u.local_date,
        ...(u.previous_date ? { p_previous_date: u.previous_date } : {}),
      });
      if (error) log.error("could not release replan claim", { user_id: u.user_id, error });
    };

    let users = 0;
    let replanned = 0;
    let failed = 0;
    let overloadedUsers = 0;
    let deferred = 0;

    /** Replans a batch; past the time budget, releases the rest for the next run. */
    const runBatch = async (batch: User[]) => {
      const queue = [...batch];
      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          for (let u = queue.shift(); u; u = queue.shift()) {
            if (Date.now() - started > TIME_BUDGET_MS) {
              deferred++;
              await release(u);
              continue;
            }
            try {
              const plan = await replanUser(db, u.user_id, now, log);
              const alerts = plan.overloads.map((o) => ({
                local_date: o.date,
                details: {
                  unscheduled_minutes: o.unscheduledMinutes,
                  assignment_ids: o.assignmentIds,
                },
              }));
              const { error } = await db.rpc("set_plan_alerts", {
                p_user_id: u.user_id,
                p_from: localDate(now, plan.timezone),
                p_alerts: alerts,
              });
              if (error) throw error;
              replanned++;
              if (alerts.length) overloadedUsers++;
            } catch (error) {
              failed++;
              log.error("replan failed", { user_id: u.user_id, error });
              await release(u);
            }
          }
        }),
      );
    };

    if (body.user_ids) {
      const batch: User[] = [];
      for (const ids of chunks(body.user_ids)) {
        const { data, error } = await db.from("profiles").select("id, timezone").in("id", ids);
        if (error) throw error;
        batch.push(...data.map((p) => ({ user_id: p.id, timezone: p.timezone })));
      }
      users = batch.length;
      await runBatch(batch);
    } else {
      // Claim and replan in batches until nobody is due or the time budget runs out.
      while (Date.now() - started <= TIME_BUDGET_MS) {
        const { data, error } = await db.rpc("claim_users_for_replan", {
          p_local_hour: NIGHTLY_LOCAL_HOUR,
          p_now: now.toISOString(),
          p_limit: CLAIM_BATCH,
        });
        if (error) throw error;
        const batch = data ?? [];
        users += batch.length;
        await runBatch(batch);
        if (batch.length < CLAIM_BATCH) break;
      }
    }

    const summary = {
      marked_missed: missed,
      users,
      replanned,
      failed,
      overloaded_users: overloadedUsers,
      deferred,
    };
    log.info("nightly replan finished", summary);
    return json(summary, { status: failed > 0 ? 207 : 200 });
  }),
);
