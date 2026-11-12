import { describe, expect, it } from "vitest";

import { categorySimilarity, categoryTokens, matchCategory, weightWarnings } from "./categories.ts";
import type { ParsedCategory } from "./result.ts";

const cats = (...names: string[]): ParsedCategory[] =>
  names.map((name) => ({ name, weight: 10, drop_lowest: null }));

describe("categoryTokens", () => {
  it("normalizes plurals, abbreviations, and filler words", () => {
    expect(categoryTokens("Quizzes")).toEqual(["quiz"]);
    expect(categoryTokens("HW")).toEqual(["homework"]);
    expect(categoryTokens("Lab Activities & Reports")).toEqual(["lab", "activity", "report"]);
    expect(categoryTokens("The Final Grade")).toEqual(["final"]);
  });
});

describe("matchCategory", () => {
  const categories = cats(
    "Exams",
    "Labs",
    "Quizzes",
    "Homework Assignments",
    "Participation",
    "Problem Sets",
  );

  it.each([
    ["Exams", "Exams", "exact"],
    ["exams", "Exams", "exact"],
    ["Quiz", "Quizzes", "fuzzy"],
    ["Lab", "Labs", "fuzzy"],
    ["HW", "Homework Assignments", "fuzzy"],
    ["Homework", "Homework Assignments", "fuzzy"],
    ["Particpation", "Participation", "fuzzy"], // typo
    ["Psets", "Problem Sets", "fuzzy"],
  ])("matches %s to %s", (name, expected, kind) => {
    expect(matchCategory(name, categories)).toMatchObject({ name: expected, kind });
  });

  it("leaves unrelated names unmatched", () => {
    expect(matchCategory("Extra Credit", categories)).toMatchObject({ kind: "none", name: null });
    expect(matchCategory(null, categories)).toMatchObject({ kind: "none", name: null });
  });

  it("refuses to guess between two equally good categories", () => {
    expect(matchCategory("Exam", cats("Midterm Exam", "Final Exam"))).toMatchObject({
      kind: "ambiguous",
      name: null,
    });
  });

  it("scores identical names as 1", () => {
    expect(categorySimilarity("Reading Responses", "reading response")).toBe(1);
  });
});

describe("weightWarnings", () => {
  const w = (...weights: (number | null)[]): ParsedCategory[] =>
    weights.map((weight, i) => ({ name: `C${String(i)}`, weight, drop_lowest: null }));

  it("accepts totals within 1 point of 100", () => {
    expect(weightWarnings(w(33.3, 33.3, 33.3))).toEqual([]);
    expect(weightWarnings(w(50, 50))).toEqual([]);
  });

  it("warns when totals are off", () => {
    const [warning, ...rest] = weightWarnings(w(40, 40));
    expect(rest).toEqual([]);
    expect(warning?.code).toBe("weights_not_100");
    expect(warning?.message).toContain("80%");
    expect(weightWarnings(w(60, 50))[0]?.message).toContain("110%");
  });

  it("warns about missing weights and missing categories", () => {
    expect(weightWarnings(w(50, null)).map((x) => x.code)).toEqual(["weights_missing"]);
    expect(weightWarnings([]).map((x) => x.code)).toEqual(["no_categories"]);
  });
});
