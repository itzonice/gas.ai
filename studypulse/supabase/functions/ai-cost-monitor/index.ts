// Scheduled hourly by pg_cron. Alerts when AI API cost over the last 24 hours passes a
// threshold for any one user (AI_COST_ALERT_USER_CENTS, default $1.00) or in total
// (AI_COST_ALERT_TOTAL_CENTS, default $50.00). Each alert fires at most once per day and
// goes to Sentry (as a warning-level message) and, if set, ALERT_WEBHOOK_URL
// (Slack-compatible { "text": ... }). Costs come from recorded token usage and the
// ai_model_prices table; see supabase/migrations/*_ai_cost_alerts.sql.
import { formatCostAlert, type CostAlert } from "@studypulse/core/analytics/index.ts";
import { z } from "zod";

import { requireCron } from "../_shared/cron.ts";
import { env } from "../_shared/env.ts";
import { createHandler } from "../_shared/handler.ts";
import { json, requireMethod } from "../_shared/http.ts";
import { Sentry } from "../_shared/sentry.ts";
import { adminClient } from "../_shared/supabase.ts";

const alertSchema = z.object({
  user_id: z.string().nullable(),
  cost_cents: z.coerce.number(),
  threshold_cents: z.coerce.number(),
  uploads: z.coerce.number().int(),
});

Deno.serve(
  createHandler("ai-cost-monitor", async (req, { log }) => {
    requireMethod(req, "POST");
    requireCron(req);
    const e = env();
    const { data, error } = await adminClient().rpc("record_ai_cost_alerts", {
      p_user_threshold_cents: e.AI_COST_ALERT_USER_CENTS,
      p_total_threshold_cents: e.AI_COST_ALERT_TOTAL_CENTS,
    });
    if (error) throw error;
    const alerts: CostAlert[] = z.array(alertSchema).parse(data);

    for (const alert of alerts) {
      const message = formatCostAlert(alert);
      log.warn("ai cost alert", { ...alert });
      Sentry.withScope((scope) => {
        scope.setTag("alert", "ai_cost");
        scope.setContext("ai_cost", { ...alert });
        Sentry.captureMessage(message, "warning");
      });
    }
    if (alerts.length && e.ALERT_WEBHOOK_URL) {
      const res = await fetch(e.ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `:rotating_light: StudyPulse AI cost\n${alerts.map(formatCostAlert).join("\n")}`,
        }),
      }).catch((err: unknown) => {
        log.error("alert webhook failed", { error: err });
        return null;
      });
      await res?.body?.cancel();
    }
    await Sentry.flush(2000);
    return json({ alerts: alerts.length });
  }),
);
