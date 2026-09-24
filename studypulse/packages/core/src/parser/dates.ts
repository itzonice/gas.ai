// Date post-processing (prompt output -> stored result): UTC conversion in the
// student's timezone, default due times, the term window, and de-duplication.
import { addDays, zonedTimeToUtc, type IsoDate } from "../time/index.ts";
import type { AiAssignmentV1 } from "./prompts/v1/schema.ts";
import type { DroppedAssignment } from "./result.ts";

/** Assignments with no stated time are due at the end of the local day. */
export const DEFAULT_DUE_TIME = "23:59";

/**
 * Items this many days outside the term are still kept: finals often fall just after
 * the last day of classes and pre-term readings just before the first.
 */
export const TERM_GRACE_DAYS = 7;

export interface DatedAssignment extends AiAssignmentV1 {
  due_at: string | null;
  default_time: boolean;
}

export function toUtc(assignment: AiAssignmentV1, timezone: string): DatedAssignment {
  if (!assignment.due_date)
    return { ...assignment, due_time: null, due_at: null, default_time: false };
  const time = assignment.due_time ?? DEFAULT_DUE_TIME;
  return {
    ...assignment,
    due_at: zonedTimeToUtc(assignment.due_date, time, timezone).toISOString(),
    default_time: assignment.due_time === null,
  };
}

export interface TermWindow {
  start: IsoDate | null;
  end: IsoDate | null;
}

export function isInTerm(date: IsoDate, term: TermWindow): boolean {
  // ISO dates compare correctly as strings.
  if (term.start && date < addDays(term.start, -TERM_GRACE_DAYS)) return false;
  if (term.end && date > addDays(term.end, TERM_GRACE_DAYS)) return false;
  return true;
}

/** Title key for duplicate detection: case, punctuation, and "#01" vs "1" don't matter. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/\b(no|number)\.?\s*(?=\d)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b0+(\d)/g, "$1")
    .replace(/^the /, "")
    .trim();
}

/** How much detail an item carries; the more specific copy of a duplicate wins. */
function specificity(a: DatedAssignment): number {
  return (
    (a.due_date ? 4 : 0) +
    (a.default_time ? 0 : 2) +
    (a.category_name ? 1 : 0) +
    (a.points_possible ? 1 : 0)
  );
}

/**
 * Removes duplicates: the same normalized title on the same date, or an undated
 * copy of an item that also appears with a date. Order of first appearance is kept.
 */
export function dedupeAssignments<T extends DatedAssignment>(
  items: readonly T[],
): { kept: T[]; dropped: DroppedAssignment[] } {
  const best = new Map<string, T>();
  const order: string[] = [];
  const dropped: DroppedAssignment[] = [];
  const datedTitles = new Set(items.filter((a) => a.due_date).map((a) => normalizeTitle(a.title)));

  for (const item of items) {
    const title = normalizeTitle(item.title);
    if (!item.due_date && datedTitles.has(title)) {
      dropped.push({ title: item.title, due_date_local: null, reason: "duplicate" });
      continue;
    }
    const key = `${title}|${item.due_date ?? "tbd"}`;
    const existing = best.get(key);
    if (!existing) {
      best.set(key, item);
      order.push(key);
    } else {
      const [winner, loser] =
        specificity(item) > specificity(existing) ? [item, existing] : [existing, item];
      best.set(key, winner);
      dropped.push({ title: loser.title, due_date_local: loser.due_date, reason: "duplicate" });
    }
  }
  return { kept: order.map((k) => best.get(k)).filter((a): a is T => a !== undefined), dropped };
}
