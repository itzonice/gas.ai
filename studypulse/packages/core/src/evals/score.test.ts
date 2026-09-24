import { describe, expect, it } from "vitest";

import type { EvalCase } from "./case.ts";
import { matchAssignments, scoreCase, summarize, titleSimilarity } from "./score.ts";
import { expectedAsResult } from "./self-check.ts";

const testCase: EvalCase = {
  description: "t",
  tags: [],
  input: { timezone: "UTC", today: "2027-01-01", term_start: null, term_end: null },
  expected: {
    course: { name: "Bio", code: null },
    categories: [
      { name: "Quizzes", weight: 40 },
      { name: "Exams", weight: 60 },
    ],
    assignments: [
      { title: "Quiz 1", due_date: "2027-02-01", due_time: null, category: "Quizzes" },
      { title: "Quiz 2", due_date: "2027-02-08", due_time: null, category: "Quizzes" },
      { title: "Midterm Exam", due_date: "2027-03-04", due_time: "10:00", category: "Exams" },
      { title: "Final Project", due_date: null, category: null },
    ],
  },
};

describe("titleSimilarity", () => {
  it("requires numbers to agree", () => {
    expect(titleSimilarity("Quiz 1", "quiz #1")).toBe(1);
    expect(titleSimilarity("Quiz 1", "Quiz 2")).toBe(0);
    expect(titleSimilarity("Midterm Exam", "Midterm")).toBeGreaterThan(0.6);
  });
});

describe("matchAssignments", () => {
  it("pairs repeated titles by date", () => {
    const expected = [
      { title: "Reading response", due_date: "2027-02-02", category: null },
      { title: "Reading response", due_date: "2027-02-09", category: null },
    ];
    const predicted = [
      { title: "Reading Response", due_date: "2027-02-09", due_time: null, category: null },
      { title: "Reading Response", due_date: "2027-02-02", due_time: null, category: null },
    ];
    expect(matchAssignments(expected, predicted)).toEqual(
      expect.arrayContaining([
        [0, 1],
        [1, 0],
      ]),
    );
  });
});

describe("scoreCase", () => {
  it("scores a perfect prediction at 100%", () => {
    const s = scoreCase(testCase, expectedAsResult(testCase));
    expect(s).toMatchObject({
      recall: 1,
      precision: 1,
      dateAccuracy: 1,
      timeAccuracy: 1,
      categoryAccuracy: 1,
      weightAccuracy: 1,
      weightTotalOk: true,
    });
    expect(s.mismatches).toEqual([]);
  });

  it("counts wrong dates, times, categories, weights, missing and extra items", () => {
    const perfect = expectedAsResult(testCase);
    const assignments = perfect.assignments.slice(0, 3).map((a) => ({ ...a }));
    assignments[0]!.due_date_local = "2027-02-02"; // wrong date
    assignments[1]!.category_name = "Exams"; // wrong category
    assignments[2]!.due_time_local = "11:00"; // wrong time
    assignments.push({ ...assignments[0]!, title: "Office hours", due_date_local: "2027-01-20" }); // extra
    const s = scoreCase(testCase, {
      assignments,
      categories: [
        { name: "Quiz", weight: 40, drop_lowest: null },
        { name: "Exams", weight: 50, drop_lowest: null },
      ],
    });
    expect(s.counts).toEqual({ expected: 4, predicted: 4, matched: 3 });
    expect(s.recall).toBe(0.75);
    expect(s.precision).toBe(0.75);
    expect(s.dateAccuracy).toBeCloseTo(2 / 3);
    expect(s.timeAccuracy).toBe(0);
    expect(s.categoryAccuracy).toBeCloseTo(2 / 3);
    expect(s.weightAccuracy).toBe(0.5);
    expect(s.weightTotalOk).toBe(false);
    expect(s.mismatches).toEqual(
      expect.arrayContaining([
        'date: "Quiz 1" expected 2027-02-01, got 2027-02-02',
        'category: "Quiz 2" expected Quizzes, got Exams',
        'time: "Midterm Exam" expected 10:00, got 11:00',
        'missing: "Final Project" (TBD)',
        'extra: "Office hours" (2027-01-20)',
        'weight: "Exams" expected 60, got 50',
      ]),
    );
  });

  it("summarizes by macro average", () => {
    const perfect = scoreCase(testCase, expectedAsResult(testCase));
    const empty = scoreCase(testCase, { assignments: [], categories: [] });
    expect(summarize([perfect, empty]).recall).toBe(0.5);
  });
});
