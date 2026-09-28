import { describe, expect, it } from "vitest";

import { findFinalExam, gradeInputFromRows, scoreNeededOn } from "./needed-on.ts";
import { whatIf } from "./what-if.ts";

const input = gradeInputFromRows(
  [
    { id: "hw", name: "Homework", weight: "40", drop_lowest: null },
    { id: "ex", name: "Exams", weight: 60, drop_lowest: 0 },
  ],
  [
    { id: "h1", category_id: "hw", points_earned: 9, points_possible: 10 }, // 90%
    { id: "m1", category_id: "ex", points_earned: "70", points_possible: "100" }, // 70%
    { id: "fin", category_id: "ex", points_earned: null, points_possible: 100 },
    { id: "h2", category_id: "hw", points_earned: null, points_possible: 10 },
  ],
);

describe("scoreNeededOn", () => {
  it("finds the score on the final that reaches the target", () => {
    // Exams: (70 + f) / 200; grade = 0.4 * 90 + 0.6 * (70 + f) / 2 => 85 needs f = 93.3
    const r = scoreNeededOn(input, "fin", 85);
    expect(r.status).toBe("reachable");
    expect(r.percent).toBeCloseTo(93.4, 0);
    expect(
      whatIf(input, { fin: { percent: r.percent ?? 0 } }).projected.percent,
    ).toBeGreaterThanOrEqual(85);
  });

  it("says when the target is already safe or out of reach", () => {
    expect(scoreNeededOn(input, "fin", 50)).toEqual({ status: "secured", percent: 0 });
    expect(scoreNeededOn(input, "fin", 99)).toEqual({ status: "impossible", percent: null });
  });
});

describe("findFinalExam", () => {
  const a = (id: string, title: string, due: string, earned: number | null = null) => ({
    id,
    title,
    kind: "exam",
    due_at: due,
    points_earned: earned,
  });
  it("prefers an ungraded exam called final, else the last ungraded exam", () => {
    expect(
      findFinalExam([a("1", "Midterm", "2027-03-01"), a("2", "Final Exam", "2027-02-01")])?.id,
    ).toBe("2");
    expect(
      findFinalExam([a("1", "Exam 1", "2027-03-01"), a("2", "Exam 2", "2027-04-01")])?.id,
    ).toBe("2");
    expect(findFinalExam([a("1", "Final", "2027-03-01", 80)])).toBeNull();
  });
});
