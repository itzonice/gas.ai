// Helpers for projecting grades with hypothetical scores (what-if and grade-needed).
import { currentGrade, isGraded } from "./current.ts";
import type { CourseGrade, GradeInput, GradedItem } from "./types.ts";

/** Points possible to assume for an ungraded item that has none: its category's average, else 100. */
export function estimatedPossible(item: GradedItem, input: GradeInput): number {
  if (item.pointsPossible !== null && item.pointsPossible > 0) return item.pointsPossible;
  const peers = input.assignments.filter(
    (a) => a.categoryId === item.categoryId && a.pointsPossible !== null && a.pointsPossible > 0,
  );
  return peers.length ? peers.reduce((s, a) => s + (a.pointsPossible ?? 0), 0) / peers.length : 100;
}

/** Items that still count toward the grade but have no score yet. */
export function remainingItems(input: GradeInput): GradedItem[] {
  const hasCategories = input.categories.length > 0;
  const weighted = new Set(input.categories.filter((c) => c.weight > 0).map((c) => c.id));
  return input.assignments.filter(
    (a) =>
      a.pointsEarned === null &&
      (hasCategories ? a.categoryId !== null && weighted.has(a.categoryId) : true),
  );
}

/**
 * Returns the input with scores filled in: `scoreFor(item, possible)` gives the
 * hypothetical points earned for each remaining item (or null to leave it ungraded).
 */
export function withScores(
  input: GradeInput,
  scoreFor: (item: GradedItem, possible: number) => number | null,
): GradeInput {
  return {
    categories: input.categories,
    assignments: input.assignments.map((a) => {
      if (isGraded(a) || a.pointsEarned !== null) return a;
      const possible = estimatedPossible(a, input);
      const earned = scoreFor(a, possible);
      return earned === null ? a : { ...a, pointsEarned: earned, pointsPossible: possible };
    }),
  };
}

/** Grade if every remaining item scored `fraction` of its points (1 = 100%). */
export function gradeIfRemainingScored(input: GradeInput, fraction: number): CourseGrade {
  const remaining = new Set(remainingItems(input).map((a) => a.id));
  return currentGrade(
    withScores(input, (item, possible) => (remaining.has(item.id) ? possible * fraction : null)),
  );
}
