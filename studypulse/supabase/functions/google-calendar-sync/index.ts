// POST /google-calendar-sync
//   User (Bearer JWT): syncs their Google Calendar now (at most once a minute).
//   Cron (x-cron-secret, every 30 minutes): syncs connections not synced in 25 minutes.
// Each sync reads free/busy from the student's primary calendar (replanning if it
// changed) and pushes study blocks and deadlines to the dedicated StudyPulse calendar.
import { requireCron } from "../_shared/cron.ts";
import { googleConfig, syncGoogleUser } from "../_shared/gcal.ts";
import { createHandler } from "../_shared/handler.ts";
import { HttpError, json, requireMethod } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

const USER_MIN_INTERVAL_MS = 60 * 1000;
const TIME_BUDGET_MS = 100_000;

Deno.serve(
  createHandler("google-calendar-sync", async (req, { log }) => {
    requireMethod(req, "POST");
    const db = adminClient();

    if (req.headers.has("x-cron-secret")) {
      requireCron(req);
      if (!googleConfig()) return json({ skipped: "google_not_configured" });
      const started = Date.now();
      const { data: due, error } = await db.rpc("gcal_connections_due", {});
      if (error) throw error;
      const totals = { synced: 0, failed: 0 };
      for (const c of due) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        try {
          await syncGoogleUser(db, c.user_id, log);
          totals.synced++;
        } catch (err) {
          totals.failed++;
          log.warn("google sync failed", { user_id: c.user_id, error: err });
        }
      }
      log.info("google sync run finished", { ...totals, due: due.length });
      return json(totals);
    }

    const user = await requireUser(req);
    const { data: conn, error } = await db
      .from("google_calendar_connections")
      .select("last_synced_at")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!conn) throw new HttpError(404, "not_connected", "Connect Google Calendar first");
    if (
      conn.last_synced_at &&
      Date.now() - Date.parse(conn.last_synced_at) < USER_MIN_INTERVAL_MS
    ) {
      return json({ skipped: "synced_recently" });
    }
    return json(await syncGoogleUser(db, user.id, log));
  }),
);
