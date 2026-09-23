import { describe, expect, it } from "vitest";

import { currentGrade } from "./current.ts";
import { chooseDrops } from "./drop-lowest.ts";
import { DEFAULT_LETTER_SCALE, letterFor, letterScaleSchema, minPercentFor } from "./letters.ts";
import { gradeNeeded } from "./needed.ts";

const s = (id: string, earned: number, possible: number) => ({ id, earned, possible });

describe("chooseDrops", () => {
  it("drops the lowest-scoring item when sizes match", () => {
    expect(chooseDrops([s("a", 9, 10), s("b", 4, 10), s("c", 8, 10)], 1)).toEqual(["b"]);
  });

  it("drops whatever maximizes the pooled percent, not just the lowest percent", () => {
    // Dropping q2 (40/100 = 40%) gives 45/60 = 75%; dropping q1 (5/10 = 50%) gives 80/150 = 53%.
    expect(chooseDrops([s("q1", 5, 10), s("q2", 40, 100), s("q3", 40, 50)], 1)).toEqual(["q2"]);
  });

  it("never drops every item", () => {
    expect(chooseDrops([s("a", 1, 10), s("b", 2, 10)], 5)).toEqual(["a"]);
    expect(chooseDrops([s("a", 1, 10)], 1)).toEqual([]);
  });

  it("falls back to greedy for large categories", () => {
    const many = Array.from({ length: 40 }, (_, i) => s(`i${String(i)}`, i === 7 ? 0 : 9, 10));
    expect(chooseDrops(many, 5)).toContain("i7");
    expect(chooseDrops(many, 5)).toHaveLength(5);
  });
});

describe("drop-lowest in grades", () => {
  const quizzes = { id: "q", name: "Quizzes", weight: 100, dropLowest: 1 };
  const item = (id: string, earned: number | null) => ({
    id,
    categoryId: "q",
    pointsEarned: earned,
    pointsPossible: 10,
  });

  it("applies to the current grade", () => {
    const g = currentGrade({
      categories: [quizzes],
      assignments: [item("1", 10), item("2", 2), item("3", 8)],
    });
    expect(g.percent).toBeCloseTo(90);
    expect(g.categories[0]!.droppedIds).toEqual(["2"]);
  });

  it("is accounted for in grade-needed", () => {
    // Graded 10 and 2; one quiz left. With the lowest dropped, 90% needs 8/10 on it (10 + 8 = 18/20).
    const r = gradeNeeded(
      { categories: [quizzes], assignments: [item("1", 10), item("2", 2), item("3", null)] },
      90,
    );
    expect(r.requiredPercent).toBeCloseTo(80, 3);
  });
});

describe("letter scales", () => {
  it("maps percents with the default scale", () => {
    expect(letterFor(93)).toBe("A");
    expect(letterFor(92.99)).toBe("A-");
    expect(letterFor(89.9999999)).toBe("A-");
    expect(letterFor(59)).toBe("F");
    expect(letterFor(105)).toBe("A");
  });

  it("uses a custom scale", () => {
    const scale = [
      { letter: "H", min: 85 },
      { letter: "P", min: 65 },
      { letter: "F", min: 0 },
    ];
    expect(letterFor(70, scale)).toBe("P");
    expect(minPercentFor("H", scale)).toBe(85);
    expect(minPercentFor("B+")).toBe(87);
  });

  it("validates scales", () => {
    expect(letterScaleSchema.safeParse(DEFAULT_LETTER_SCALE).success).toBe(true);
    expect(
      letterScaleSchema.safeParse([
        { letter: "A", min: 90 },
        { letter: "B", min: 95 },
      ]).success,
    ).toBe(false);
    expect(
      letterScaleSchema.safeParse([
        { letter: "A", min: 90 },
        { letter: "A", min: 80 },
      ]).success,
    ).toBe(false);
    expect(letterScaleSchema.safeParse([]).success).toBe(false);
  });
});
