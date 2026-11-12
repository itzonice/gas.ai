// POST /plan-study: rebuilds the caller's study plan for the next four weeks and
// returns what was scheduled, what didn't fit, and which days are overloaded.
import { createHandler } from "../_shared/handler.ts";
import { json, requireMethod } from "../_shared/http.ts";
import { replanUser } from "../_shared/planner.ts";
import { requireUser, userClient } from "../_shared/supabase.ts";

Deno.serve(
  createHandler("plan-study", async (req, { log }) => {
    requireMethod(req, "POST");
    const user = await requireUser(req);
    const summary = await replanUser(userClient(req), user.id, new Date(), log);
    return json({
      blocks: summary.blocks.length,
      scheduled_minutes: summary.blocks.reduce((s, b) => s + b.minutes, 0),
      unscheduled: summary.unscheduled,
      overloaded_days: summary.overloadedDays,
    });
  }),
);
