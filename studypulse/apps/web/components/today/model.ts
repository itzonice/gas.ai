// Pure formatting for the Today screen, kept out of the components so it is easy to test.
// No business rules here: ranking, at-risk, and week bounds come from the server.
import type { TodayFeedRow, TodayOverview } from "@studypulse/core/api";
import { formatDue } from "@studypulse/core/notify";

/** 95 -> "1.6", 120 -> "2", 0 -> "0". */
export function focusHours(minutes: number): string {
  return (Math.round(minutes / 6) / 10).toString();
}

export function atRiskStatus(
  courses: TodayOverview["courses_at_risk"],
): { tone: "error"; text: string } | undefined {
  if (courses.length === 0) return undefined;
  return { tone: "error", text: `At risk: ${courses.map((c) => c.code).join(", ")}` };
}

export function dueText(dueAt: string | null, timeZone: string, now: Date): string {
  if (!dueAt) return "No due date";
  return `Due ${formatDue(new Date(dueAt), timeZone, now)}`;
}

/** "Worth 20% · 45 min left", omitting parts that don't apply. */
export function taskMeta(row: Pick<TodayFeedRow, "grade_share" | "minutes_remaining">): string {
  const parts: string[] = [];
  if (row.grade_share !== null && row.grade_share > 0)
    parts.push(`Worth ${formatNumber(row.grade_share)}%`);
  if (row.minutes_remaining > 0) parts.push(`${formatMinutes(row.minutes_remaining)} left`);
  return parts.join(" · ");
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "3:00–3:30 PM" in the user's timezone. */
export function timeRange(startsAt: string, endsAt: string, timeZone: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" });
  return fmt.formatRange(new Date(startsAt), new Date(endsAt));
}

/** "Review · 1 h" or "Closed notes · 20 min" for a review item. */
export function reviewMeta(row: Pick<TodayFeedRow, "block_kind" | "planned_minutes">): string {
  const label =
    row.block_kind === "practice_quiz"
      ? "Closed notes"
      : row.block_kind === "exam_prep"
        ? "Exam prep"
        : "Review";
  return `${label} · ${formatMinutes(row.planned_minutes)}`;
}

export function examCountdown(daysUntil: number): string {
  if (daysUntil <= 0) return "Today";
  if (daysUntil === 1) return "Tomorrow";
  return `In ${daysUntil} days`;
}

function formatNumber(n: number): string {
  return Number.isInteger(n) ? n.toString() : n.toFixed(1).replace(/\.0$/, "");
}
