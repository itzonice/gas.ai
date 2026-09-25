// Score needed on one specific item (usually the final exam) to reach a target, with
// everything else as it stands: graded work counts, other ungraded work stays out.
import { whatIf } from "./what-if.ts";
import type { GradeInput } from "./types.ts";

export interface ScoreNeededOn {
  /** secured: the target holds even with 0 on the item; impossible: it would take over 100%. */
  status: "secured" | "reachable" | "impossible";
  /** Percent needed on the item (0 when secured; null when impossible). */
  percent: number | null;
}

const MAX_PERCENT = 100;

export function scoreNeededOn(
  input: GradeInput,
  itemId: string,
  targetPercent: number,
): ScoreNeededOn {
  const at = (percent: number) => whatIf(input, { [itemId]: { percent } }).projected.percent ?? 0;
  if (at(0) >= targetPercent) return { status: "secured", percent: 0 };
  if (at(MAX_PERCENT) < targetPercent) return { status: "impossible", percent: null };
  let lo = 0;
  let hi = MAX_PERCENT;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) >= targetPercent) hi = mid;
    else lo = mid;
  }
  // Round up so the shown score is always enough.
  return { status: "reachable", percent: Math.min(MAX_PERCENT, Math.ceil(hi * 10) / 10) };
}

/** The course's final exam: an ungraded exam titled "final", else the last ungraded exam. */
export function findFinalExam<
  T extends {
    id: string;
    kind: string;
    title: string;
    due_at: string | null;
    points_earned: number | null;
  },
>(assignments: readonly T[]): T | null {
  const open = assignments.filter((a) => a.kind === "exam" && a.points_earned === null);
  const named = open.find((a) => /\bfinal\b/i.test(a.title));
  if (named) return named;
  return (
    [...open]
      .filter((a) => a.due_at)
      .sort((a, b) => (b.due_at ?? "").localeCompare(a.due_at ?? ""))[0] ?? null
  );
}

/** Database rows -> the grade functions' input. */
export function gradeInputFromRows(
  categories: readonly {
    id: string;
    name: string;
    weight: number | string;
    drop_lowest: number | null;
  }[],
  assignments: readonly {
    id: string;
    category_id: string | null;
    points_earned: number | string | null;
    points_possible: number | string | null;
  }[],
): GradeInput {
  const num = (v: number | string | null) => (v === null ? null : Number(v));
  return {
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      weight: Number(c.weight),
      dropLowest: c.drop_lowest ?? 0,
    })),
    assignments: assignments.map((a) => ({
      id: a.id,
      categoryId: a.category_id,
      pointsEarned: num(a.points_earned),
      pointsPossible: num(a.points_possible),
    })),
  };
}
