// Current grade: the weighted average over categories that have at least one graded
// item. Categories with no scores yet are left out and the remaining weights are
// renormalized, so a student with only homework graded sees their homework percent
// rather than an artificially low number.
import type { CategoryGrade, CourseGrade, GradeInput, GradedItem } from "./types.ts";

/** An item counts once it has both a score and a positive points possible. */
export function isGraded(
  item: GradedItem,
): item is GradedItem & { pointsEarned: number; pointsPossible: number } {
  return item.pointsEarned !== null && item.pointsPossible !== null && item.pointsPossible > 0;
}

function categoryGrade(
  items: readonly GradedItem[],
  categoryId: string | null,
  weight: number,
): CategoryGrade {
  const graded = items.filter(isGraded);
  const earned = graded.reduce((s, a) => s + a.pointsEarned, 0);
  const possible = graded.reduce((s, a) => s + a.pointsPossible, 0);
  return {
    categoryId,
    percent: possible > 0 ? (earned / possible) * 100 : null,
    earned,
    possible,
    gradedCount: graded.length,
    weight,
  };
}

export function currentGrade(input: GradeInput): CourseGrade {
  // Without categories, the course is one pool of points.
  if (input.categories.length === 0) {
    const pool = categoryGrade(input.assignments, null, 100);
    return {
      percent: pool.percent,
      countedWeight: pool.percent === null ? 0 : 100,
      totalWeight: 100,
      categories: [pool],
    };
  }

  const categories = input.categories.map((c) =>
    categoryGrade(
      input.assignments.filter((a) => a.categoryId === c.id),
      c.id,
      c.weight,
    ),
  );
  const counted = categories.filter((c) => c.percent !== null && c.weight > 0);
  const countedWeight = counted.reduce((s, c) => s + c.weight, 0);
  const percent =
    countedWeight > 0
      ? counted.reduce((s, c) => s + c.weight * (c.percent ?? 0), 0) / countedWeight
      : null;

  return {
    percent,
    countedWeight,
    totalWeight: input.categories.reduce((s, c) => s + c.weight, 0),
    categories,
  };
}
