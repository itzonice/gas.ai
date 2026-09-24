import { describe, expect, it } from "vitest";

import { gradeNeeded } from "./needed.ts";
import type { GradeInput } from "./types.ts";

const item = (
  id: string,
  categoryId: string | null,
  earned: number | null,
  possible: number | null,
) => ({
  id,
  categoryId,
  pointsEarned: earned,
  pointsPossible: possible,
});

// Exams 60% (midterm 80/100 done, final 0/100 to go), Homework 40% (all done: 90%).
const course: GradeInput = {
  categories: [
    { id: "exams", name: "Exams", weight: 60 },
    { id: "hw", name: "Homework", weight: 40 },
  ],
  assignments: [
    item("mid", "exams", 80, 100),
    item("final", "exams", null, 100),
    item("hw", "hw", 90, 100),
  ],
};

describe("gradeNeeded", () => {
  it("solves for the score needed on the remaining work", () => {
    // final grade = 0.6 * (80 + x) / 200 * 100 + 0.4 * 90 = 24 + 0.3x + 36 -> 85 needs x = 83.33
    const r = gradeNeeded(course, 85);
    expect(r.status).toBe("reachable");
    expect(r.requiredPercent).toBeCloseTo(83.333, 2);
    expect(r.worstCasePercent).toBeCloseTo(60);
    expect(r.bestCasePercent).toBeCloseTo(90);
    expect(r.currentPercent).toBeCloseTo(84);
  });

  it("reports a secured target when zeros on the rest still reach it", () => {
    const r = gradeNeeded(course, 55);
    expect(r).toMatchObject({ status: "secured", requiredPercent: 0 });
  });

  it("reports an impossible target and how much it would take", () => {
    const r = gradeNeeded(course, 95);
    expect(r.status).toBe("impossible");
    expect(r.requiredPercent).toBeCloseTo(116.667, 2);
    expect(gradeNeeded(course, 200)).toMatchObject({ status: "impossible", requiredPercent: null });
  });

  it("handles no remaining work", () => {
    const done: GradeInput = {
      ...course,
      assignments: course.assignments.map((a) => ({ ...a, pointsEarned: a.pointsEarned ?? 70 })),
    };
    const r = gradeNeeded(done, 90);
    expect(r.status).toBe("no_remaining_work");
    expect(r.finalPercent).toBeCloseTo(0.6 * 75 + 0.4 * 90);
  });

  it("counts categories that only have remaining work", () => {
    // Nothing graded in exams yet: current grade is homework only (90), but the
    // projection must include the exam category's 60%.
    const input: GradeInput = {
      ...course,
      assignments: [item("final", "exams", null, 100), item("hw", "hw", 90, 100)],
    };
    const r = gradeNeeded(input, 90);
    expect(r.currentPercent).toBeCloseTo(90);
    expect(r.requiredPercent).toBeCloseTo(90);
  });

  it("estimates points for remaining items without points possible", () => {
    const input: GradeInput = {
      categories: [{ id: "q", name: "Quizzes", weight: 100 }],
      assignments: [item("q1", "q", 10, 10), item("q2", "q", null, null)],
    };
    // q2 assumed worth 10 (category average): 80% overall needs 6/10.
    expect(gradeNeeded(input, 80).requiredPercent).toBeCloseTo(60);
  });

  it("reports weight from categories with no assignments", () => {
    const input: GradeInput = {
      categories: [...course.categories, { id: "proj", name: "Project", weight: 20 }],
      assignments: course.assignments,
    };
    expect(gradeNeeded(input, 85).unaccountedWeight).toBe(20);
  });
});
