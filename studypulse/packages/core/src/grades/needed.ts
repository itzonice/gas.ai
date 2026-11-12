// Grade needed: the uniform score on all remaining work that reaches a target grade.
import { currentGrade } from "./current.ts";
import { gradeIfRemainingScored, remainingItems } from "./projection.ts";
import type { GradeInput } from "./types.ts";

export type GradeNeededStatus =
  /** The target is reached even with zeros on everything left. */
  | "secured"
  /** Reachable with `requiredPercent` (at most 100%) on the remaining work. */
  | "reachable"
  /** Needs more than 100% on the remaining work (requiredPercent says how much, if finite). */
  | "impossible"
  /** Nothing left to grade; `finalPercent` is the final grade. */
  | "no_remaining_work";

export interface GradeNeeded {
  status: GradeNeededStatus;
  /** Uniform percent needed on every remaining item; 0 when secured, null if unreachable. */
  requiredPercent: number | null;
  /** Grade with zeros on everything remaining. */
  worstCasePercent: number | null;
  /** Grade with 100% on everything remaining. */
  bestCasePercent: number | null;
  /** Current grade (only graded work). */
  currentPercent: number | null;
  /** Final grade when nothing remains. */
  finalPercent: number | null;
  remainingCount: number;
  /**
   * Weight of categories with no assignments at all (e.g. a final exam not added yet).
   * The projection can't account for them, so the UI should say so.
   */
  unaccountedWeight: number;
}

/** Highest uniform score considered when a target needs extra credit (300%). */
const MAX_FRACTION = 3;
const EPSILON = 1e-7;

export function gradeNeeded(input: GradeInput, targetPercent: number): GradeNeeded {
  const current = currentGrade(input).percent;
  const remaining = remainingItems(input);
  const withItems = new Set(input.assignments.map((a) => a.categoryId));
  const unaccountedWeight = input.categories
    .filter((c) => c.weight > 0 && !withItems.has(c.id))
    .reduce((s, c) => s + c.weight, 0);
  const base = { currentPercent: current, remainingCount: remaining.length, unaccountedWeight };

  if (remaining.length === 0) {
    return {
      ...base,
      status: "no_remaining_work",
      requiredPercent: null,
      worstCasePercent: current,
      bestCasePercent: current,
      finalPercent: current,
    };
  }

  const at = (fraction: number) => gradeIfRemainingScored(input, fraction).percent ?? 0;
  const worst = at(0);
  const best = at(1);
  const range = { worstCasePercent: worst, bestCasePercent: best, finalPercent: null };

  if (worst >= targetPercent - EPSILON)
    return { ...base, ...range, status: "secured", requiredPercent: 0 };
  if (at(MAX_FRACTION) < targetPercent - EPSILON) {
    return { ...base, ...range, status: "impossible", requiredPercent: null };
  }

  // The projected grade never decreases as the remaining score rises, so bisect.
  let lo = 0;
  let hi = MAX_FRACTION;
  for (let i = 0; i < 60 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= targetPercent - EPSILON) hi = mid;
    else lo = mid;
  }
  const requiredPercent = hi * 100;
  return {
    ...base,
    ...range,
    status: requiredPercent <= 100 + 1e-6 ? "reachable" : "impossible",
    requiredPercent,
  };
}
