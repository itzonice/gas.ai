// What-if: the grade projected from hypothetical scores on ungraded (or re-scored) items.
import { currentGrade } from "./current.ts";
import { estimatedPossible } from "./projection.ts";
import type { CourseGrade, GradeInput } from "./types.ts";

export type Hypothetical =
  /** A score in points (points possible comes from the item, or is estimated). */
  | { points: number }
  /** A score as a percent of the item's points possible. */
  | { percent: number };

export interface WhatIfResult {
  /** Grade with the hypotheticals applied. Ungraded items without one stay out. */
  projected: CourseGrade;
  current: CourseGrade;
  /** projected - current, in percentage points (null if either is null). */
  change: number | null;
  /** Hypothetical ids that don't match any assignment. */
  unknownIds: string[];
}

/**
 * Applies hypothetical scores and recomputes the grade. A hypothetical on an item that
 * already has a score replaces it ("what if I'd gotten 90 on the midterm").
 */
export function whatIf(
  input: GradeInput,
  hypotheticals: Readonly<Record<string, Hypothetical>>,
): WhatIfResult {
  const ids = new Set(input.assignments.map((a) => a.id));
  const projectedInput: GradeInput = {
    categories: input.categories,
    assignments: input.assignments.map((a) => {
      const h = hypotheticals[a.id];
      if (!h) return a;
      const possible = estimatedPossible(a, input);
      const earned = "points" in h ? h.points : (h.percent / 100) * possible;
      return { ...a, pointsEarned: Math.max(0, earned), pointsPossible: possible };
    }),
  };
  const current = currentGrade(input);
  const projected = currentGrade(projectedInput);
  return {
    projected,
    current,
    change:
      projected.percent !== null && current.percent !== null
        ? projected.percent - current.percent
        : null,
    unknownIds: Object.keys(hypotheticals).filter((id) => !ids.has(id)),
  };
}
