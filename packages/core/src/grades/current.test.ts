import { describe, expect, it } from "vitest";

import { currentGrade } from "./current.ts";
import type { GradeInput } from "./types.ts";

const cats = [
  { id: "exams", name: "Exams", weight: 50 },
  { id: "hw", name: "Homework", weight: 30 },
  { id: "quiz", name: "Quizzes", weight: 20 },
];
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

describe("currentGrade", () => {
  it("is null before anything is graded", () => {
    const g = currentGrade({ categories: cats, assignments: [item("a", "hw", null, 10)] });
    expect(g.percent).toBeNull();
    expect(g.countedWeight).toBe(0);
  });

  it("renormalizes over categories that have scores", () => {
    // Only homework graded: 18/20 = 90%, regardless of the 50% exam weight.
    const g = currentGrade({
      categories: cats,
      assignments: [item("h1", "hw", 9, 10), item("h2", "hw", 9, 10)],
    });
    expect(g.percent).toBeCloseTo(90);
    expect(g.countedWeight).toBe(30);
  });

  it("weights categories and pools points within a category", () => {
    const input: GradeInput = {
      categories: cats,
      assignments: [
        item("e1", "exams", 80, 100), // exams 80%
        item("h1", "hw", 10, 10),
        item("h2", "hw", 5, 10), // hw 15/20 = 75%
        item("q1", "quiz", null, 10), // ungraded quiz ignored
      ],
    };
    // (50*80 + 30*75) / 80 = 78.125
    expect(currentGrade(input).percent).toBeCloseTo(78.125);
  });

  it("allows extra credit above 100%", () => {
    const g = currentGrade({ categories: cats, assignments: [item("h1", "hw", 11, 10)] });
    expect(g.percent).toBeCloseTo(110);
  });

  it("ignores zero-weight categories and items with no points possible", () => {
    const g = currentGrade({
      categories: [...cats, { id: "bonus", name: "Bonus", weight: 0 }],
      assignments: [item("b", "bonus", 5, 5), item("x", "hw", 5, null), item("h", "hw", 7, 10)],
    });
    expect(g.percent).toBeCloseTo(70);
  });

  it("treats a course without categories as one points pool", () => {
    const g = currentGrade({
      categories: [],
      assignments: [item("a", null, 45, 50), item("b", null, 35, 50)],
    });
    expect(g.percent).toBeCloseTo(80);
  });

  it("does not count uncategorized items when categories exist", () => {
    const g = currentGrade({
      categories: cats,
      assignments: [item("a", null, 0, 100), item("h", "hw", 9, 10)],
    });
    expect(g.percent).toBeCloseTo(90);
  });

  it("handles weights that don't total 100", () => {
    const g = currentGrade({
      categories: [
        { id: "a", name: "A", weight: 1 },
        { id: "b", name: "B", weight: 3 },
      ],
      assignments: [item("1", "a", 100, 100), item("2", "b", 60, 100)],
    });
    expect(g.percent).toBeCloseTo(70);
  });
});
