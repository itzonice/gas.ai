// Task priority for the Today feed and the scheduler. Combines:
//   impact   - the task's share of the final grade (damped: 2% vs 30% matters, 30% vs 40% less so)
//   urgency  - how little slack is left: days until due minus the days of work remaining
//   status   - done/skipped tasks drop out; in-progress work gets a small momentum boost
// into a 0-1 blend, then places it in a band so the order between kinds of work is fixed:
//   90-100  overdue and still open (the student hasn't finished or skipped it), whatever
//           its weight: late work that can still be handed in comes first. Work that can't
//           be submitted any more should be marked skipped, which scores 0.
//   10-90   dated work that counts toward the grade (grade share > 0)
//    0-10   undated work, and work with no category or weight (grade share 0): it still
//           ranks, but always below dated, weighted work
//    0      done or skipped
// Non-finite inputs are treated as missing (share 0, no due date, no work left), so the
// score is always a number from 0 to 100.
// The SQL function public.task_priority mirrors this formula exactly (parity-tested).

export type TaskStatus = "todo" | "in_progress" | "done" | "skipped";
export type TaskKind =
  "assignment" | "quiz" | "exam" | "project" | "reading" | "lab" | "discussion" | "other";

export const PRIORITY_WEIGHTS = { impact: 0.55, urgency: 0.45 } as const;
/** Grade share at or above which impact is maxed out. */
export const IMPACT_SATURATION_SHARE = 30;
export const IN_PROGRESS_BOOST = 1.1;
/** Urgency for tasks with no due date. */
export const UNDATED_URGENCY = 0.05;
/** Score bands (see the header). */
export const PRIORITY_BANDS = {
  overdue: { min: 90, max: 100 },
  dated: { min: 10, max: 90 },
  low: { min: 0, max: 10 },
} as const;
export type PriorityBand = keyof typeof PRIORITY_BANDS | "finished";
/** Default study capacity when the user hasn't set one. */
export const DEFAULT_DAILY_MINUTES = 120;

/** Effort to assume when a task has no estimate, by kind. */
export const DEFAULT_MINUTES_BY_KIND: Record<TaskKind, number> = {
  exam: 240,
  project: 300,
  assignment: 90,
  lab: 120,
  quiz: 45,
  reading: 45,
  discussion: 30,
  other: 60,
};

export interface PriorityInput {
  /** Share of the final grade, in percent (0-100). */
  gradeShare: number;
  /** Due instant (ISO string or Date), or null if undated. */
  dueAt: string | Date | null;
  now: Date;
  /** Estimated minutes of work left. */
  minutesRemaining: number;
  status: TaskStatus;
  /** How many minutes a day the student can study (for converting work to days). */
  dailyMinutes?: number;
}

export interface PriorityBreakdown {
  /** 0-100; 0 for finished tasks. */
  score: number;
  band: PriorityBand;
  impact: number;
  urgency: number;
  daysUntilDue: number | null;
  slackDays: number | null;
  overdue: boolean;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function impactScore(gradeShare: number): number {
  return Math.sqrt(clamp01(Math.max(0, gradeShare) / IMPACT_SATURATION_SHARE));
}

export function urgencyScore(
  daysUntilDue: number | null,
  workDays: number,
): { urgency: number; slackDays: number | null } {
  if (daysUntilDue === null) return { urgency: UNDATED_URGENCY, slackDays: null };
  if (daysUntilDue <= 0) return { urgency: 1, slackDays: daysUntilDue - workDays };
  const slackDays = daysUntilDue - workDays;
  return { urgency: 1 / (1 + Math.max(0, slackDays)), slackDays };
}

export function priority(input: PriorityInput): PriorityBreakdown {
  const finite = (x: number) => Number.isFinite(x);
  const dailyMinutes =
    input.dailyMinutes !== undefined && finite(input.dailyMinutes) && input.dailyMinutes > 0
      ? input.dailyMinutes
      : DEFAULT_DAILY_MINUTES;
  const share = finite(input.gradeShare) ? Math.max(0, input.gradeShare) : 0;
  const minutes = finite(input.minutesRemaining) ? Math.max(0, input.minutesRemaining) : 0;
  const dueMs = input.dueAt === null ? NaN : new Date(input.dueAt).getTime();
  const daysUntilDue = finite(dueMs) ? (dueMs - input.now.getTime()) / 86_400_000 : null;
  const workDays = minutes / dailyMinutes;
  const impact = impactScore(share);
  const { urgency, slackDays } = urgencyScore(daysUntilDue, workDays);
  const overdue = daysUntilDue !== null && daysUntilDue < 0;

  if (input.status === "done" || input.status === "skipped") {
    return { score: 0, band: "finished", impact, urgency, daysUntilDue, slackDays, overdue: false };
  }
  const blend = PRIORITY_WEIGHTS.impact * impact + PRIORITY_WEIGHTS.urgency * urgency;
  const base = Math.min(1, input.status === "in_progress" ? blend * IN_PROGRESS_BOOST : blend);
  const band: PriorityBand = overdue
    ? "overdue"
    : daysUntilDue !== null && share > 0
      ? "dated"
      : "low";
  const { min, max } = PRIORITY_BANDS[band];
  return {
    score: Math.round((min + (max - min) * base) * 1000) / 1000,
    band,
    impact,
    urgency,
    daysUntilDue,
    slackDays,
    overdue,
  };
}

export interface ShareCategory {
  id: string;
  weight: number;
}
export interface ShareItem {
  id: string;
  categoryId: string | null;
  pointsPossible: number | null;
}

/**
 * An assignment's share of the final grade: its category's weight (renormalized over
 * all weighted categories) times its fraction of the category's points. Items without
 * points possible count as their category's average item. Uncategorized items in a
 * course with categories have no share; in a course without categories, items split
 * 100% by points.
 */
export function gradeShare(
  itemId: string,
  categories: readonly ShareCategory[],
  items: readonly ShareItem[],
): number {
  const item = items.find((i) => i.id === itemId);
  if (!item) return 0;
  const pointsOf = (group: readonly ShareItem[], it: ShareItem) => {
    if (it.pointsPossible !== null && it.pointsPossible > 0) return it.pointsPossible;
    const known = group.filter((g) => g.pointsPossible !== null && g.pointsPossible > 0);
    return known.length ? known.reduce((s, g) => s + (g.pointsPossible ?? 0), 0) / known.length : 1;
  };

  if (categories.length === 0) {
    const total = items.reduce((s, it) => s + pointsOf(items, it), 0);
    return total > 0 ? (pointsOf(items, item) / total) * 100 : 0;
  }
  const category = categories.find((c) => c.id === item.categoryId);
  const totalWeight = categories.reduce((s, c) => s + Math.max(0, c.weight), 0);
  if (!category || category.weight <= 0 || totalWeight <= 0) return 0;
  const group = items.filter((it) => it.categoryId === category.id);
  const groupPoints = group.reduce((s, it) => s + pointsOf(group, it), 0);
  return groupPoints > 0
    ? (category.weight / totalWeight) * (pointsOf(group, item) / groupPoints) * 100
    : 0;
}

/** Minutes of work left: the estimate (or a default for the kind) minus time already logged. */
export function minutesRemaining(
  estimatedMinutes: number | null,
  kind: TaskKind,
  loggedMinutes: number,
): number {
  const estimate = estimatedMinutes ?? DEFAULT_MINUTES_BY_KIND[kind];
  return Math.max(0, estimate - Math.max(0, loggedMinutes));
}
