// Formatting for AI cost alerts (ai-cost-monitor). Pure, so the wording is testable.
export interface CostAlert {
  /** null: total spend across all users. */
  user_id: string | null;
  cost_cents: number;
  threshold_cents: number;
  uploads: number;
}

export const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** One line per alert, for logs, Sentry, and Slack-style webhooks. */
export function formatCostAlert(alert: CostAlert): string {
  const subject = alert.user_id ? `User ${alert.user_id}` : "Total AI spend";
  const uploads = `${String(alert.uploads)} upload${alert.uploads === 1 ? "" : "s"}`;
  return `${subject}: ${dollars(alert.cost_cents)} in the last 24 hours (${uploads}), over the ${dollars(alert.threshold_cents)} alert threshold`;
}
