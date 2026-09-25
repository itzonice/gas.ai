// POST /canvas-sync
//   User (Bearer JWT), body {} or { "connection_id": uuid }: syncs their Canvas
//   connection(s) now. Rate-limited to once per 5 minutes per connection.
//   Cron (x-cron-secret, hourly): syncs connections not synced for 6 hours, oldest first.
// Each sync fetches the student's active courses, weighted assignment groups, and
// assignments (with their scores) and hands them to lms_apply_canvas_sync, which matches
// by Canvas id, skips unchanged items, and never overwrites the user's own edits.
import { CanvasApiError, fetchCanvasSnapshot } from "@studypulse/core/lms/index.ts";
import { z } from "zod";

import { canvasSession } from "../_shared/canvas.ts";
import { requireCron } from "../_shared/cron.ts";
import { createHandler } from "../_shared/handler.ts";
import { HttpError, json, parseJsonBody, requireMethod } from "../_shared/http.ts";
import { adminClient, requireUser, type AdminClient } from "../_shared/supabase.ts";

const USER_MIN_INTERVAL_MS = 5 * 60 * 1000;
const TIME_BUDGET_MS = 100_000;

async function syncOne(db: AdminClient, connectionId: string) {
  const session = await canvasSession(db, connectionId);
  let snapshot;
  try {
    snapshot = await fetchCanvasSnapshot(session.baseUrl, session.accessToken);
  } catch (err) {
    if (err instanceof CanvasApiError && err.status === 401) {
      // The token was revoked in Canvas: ask the user to reconnect.
      await db.rpc("lms_mark_needs_reauth", {
        p_connection_id: connectionId,
        p_error: err.message,
      });
      throw new HttpError(409, "canvas_reauth_required", "Reconnect Canvas to keep syncing");
    }
    throw err;
  }
  const { data, error } = await db.rpc("lms_apply_canvas_sync", {
    p_connection_id: connectionId,
    p_courses: snapshot,
  });
  if (error) throw error;
  return data;
}

Deno.serve(
  createHandler("canvas-sync", async (req, { log }) => {
    requireMethod(req, "POST");
    const db = adminClient();

    if (req.headers.has("x-cron-secret")) {
      requireCron(req);
      const started = Date.now();
      const { data: due, error } = await db.rpc("lms_connections_due", {});
      if (error) throw error;
      const totals = { synced: 0, failed: 0 };
      for (const c of due) {
        if (Date.now() - started > TIME_BUDGET_MS) break;
        try {
          await syncOne(db, c.connection_id);
          totals.synced++;
        } catch (err) {
          totals.failed++;
          log.warn("canvas sync failed", { connection_id: c.connection_id, error: err });
          await db.rpc("lms_record_sync_error", {
            p_connection_id: c.connection_id,
            p_error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      log.info("canvas sync run finished", { ...totals, due: due.length });
      return json(totals);
    }

    const user = await requireUser(req);
    const body = await parseJsonBody(req, z.object({ connection_id: z.uuid().optional() }), {
      allowEmpty: true,
    });
    let query = db
      .from("lms_connections")
      .select("id, status, last_synced_at")
      .eq("user_id", user.id);
    if (body.connection_id) query = query.eq("id", body.connection_id);
    const { data: connections, error } = await query;
    if (error) throw error;
    if (!connections.length)
      throw new HttpError(404, "connection_not_found", "Connect Canvas first");

    const results: Record<string, unknown> = {};
    for (const c of connections) {
      if (c.last_synced_at && Date.now() - Date.parse(c.last_synced_at) < USER_MIN_INTERVAL_MS) {
        results[c.id] = { skipped: "synced_recently" };
        continue;
      }
      results[c.id] = await syncOne(db, c.id);
    }
    return json({ results });
  }),
);
