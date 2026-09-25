// Scheduled every 5 minutes by pg_cron. Sends pending analytics_events (the outbox the
// database triggers fill) to PostHog in batches and marks them sent. A failed batch stays
// pending and is retried next run (up to 10 attempts); PostHog dedupes on the event uuid,
// so a batch sent twice counts once. Without POSTHOG_API_KEY it does nothing, and events
// wait in the outbox.
import { outboxEventSchema, sendPostHogBatch } from "@studypulse/core/analytics/index.ts";

import { requireCron } from "../_shared/cron.ts";
import { env } from "../_shared/env.ts";
import { createHandler } from "../_shared/handler.ts";
import { json, requireMethod } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

const MAX_BATCHES_PER_RUN = 20;

Deno.serve(
  createHandler("flush-analytics", async (req, { log }) => {
    requireMethod(req, "POST");
    requireCron(req);
    const e = env();
    if (!e.POSTHOG_API_KEY) return json({ skipped: "not_configured" });
    const options = {
      apiKey: e.POSTHOG_API_KEY,
      ...(e.POSTHOG_HOST ? { host: e.POSTHOG_HOST } : {}),
      environment: e.APP_ENV,
    };
    const db = adminClient();
    const totals = { sent: 0, failed: 0, invalid: 0 };

    for (let i = 0; i < MAX_BATCHES_PER_RUN; i++) {
      const { data: rows, error } = await db.rpc("analytics_claim_batch", {});
      if (error) throw error;
      if (!rows.length) break;
      const events = rows.flatMap((r) => {
        const parsed = outboxEventSchema.safeParse(r);
        if (!parsed.success) totals.invalid++;
        return parsed.success ? [parsed.data] : [];
      });
      try {
        await sendPostHogBatch(events, options);
      } catch (err) {
        totals.failed += events.length;
        log.warn("posthog batch failed; retrying next run", { error: err, size: events.length });
        break;
      }
      const { error: markError } = await db.rpc("analytics_mark_sent", {
        p_ids: events.map((x) => x.id),
      });
      if (markError) throw markError;
      totals.sent += events.length;
    }
    log.info("analytics flush finished", totals);
    return json(totals);
  }),
);
