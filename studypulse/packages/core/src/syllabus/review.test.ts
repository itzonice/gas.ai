import { describe, expect, it } from "vitest";

import type { ParseResult, ParsedAssignment } from "../parser/result.ts";
import {
  draftToPayload,
  needsReview,
  reviewReasons,
  toReviewDraft,
  totalWeight,
} from "./review.ts";

const flags = {
  inferred_date: false,
  inferred_year: false,
  expanded_recurring: false,
  tbd: false,
  default_time: false,
  category_unmatched: false,
};

function assignment(title: string, extra: Partial<ParsedAssignment> = {}): ParsedAssignment {
  return {
    title,
    kind: "assignment",
    category_name: "Homework",
    original_category_name: "Homework",
    due_at: "2027-02-10T05:59:00Z",
    due_date_local: "2027-02-09",
    due_time_local: "23:59",
    points_possible: 10,
    flags,
    confidence: "high",
    source_quote: title,
    ...extra,
  };
}

const result: ParseResult = {
  prompt_version: "v1",
  model: "test",
  timezone: "America/Chicago",
  course: {
    name: "Biology",
    code: "BIO 201",
    instructor: null,
    term_start: "2027-01-11",
    term_end: "2027-05-07",
  },
  categories: [
    { name: "Homework", weight: 40, drop_lowest: 1 },
    { name: "Exams", weight: 60, drop_lowest: null },
  ],
  assignments: [
    assignment("HW 1", { due_date_local: "2027-01-20", due_time_local: "09:00" }),
    assignment("Quiz week 5", {
      confidence: "low",
      flags: { ...flags, inferred_date: true, default_time: true },
      due_date_local: "2027-02-12",
    }),
    assignment("Final project", {
      confidence: "low",
      flags: { ...flags, tbd: true },
      due_at: null,
      due_date_local: null,
      due_time_local: null,
    }),
    assignment("Lab 3", {
      confidence: "medium",
      flags: { ...flags, expanded_recurring: true },
      due_date_local: "2027-01-28",
    }),
  ],
  dropped: [],
  meetings: [
    { weekday: "tue", start_time: "10:00", end_time: "10:50", kind: "lecture", location: null },
  ],
  grading_scale: [
    { letter: "B", min_percent: 80 },
    { letter: "A", min_percent: 90 },
    { letter: "F", min_percent: 0 },
  ],
  warnings: [],
  summary: {
    total: 4,
    high: 1,
    medium: 1,
    low: 2,
    inferred_dates: 1,
    inferred_years: 0,
    expanded_recurring: 1,
    tbd: 1,
    default_times: 1,
    categories_unmatched: 0,
  },
};

describe("syllabus review draft", () => {
  it("puts low-confidence items first, then medium, then high; undated last within a level", () => {
    const draft = toReviewDraft(result);
    expect(draft.items.map((i) => i.title)).toEqual([
      "Quiz week 5",
      "Final project",
      "Lab 3",
      "HW 1",
    ]);
    expect(draft.items.filter(needsReview)).toHaveLength(3);
  });

  it("explains uncertainty in plain words", () => {
    const quiz = result.assignments[1];
    if (!quiz) throw new Error("fixture");
    expect(reviewReasons(quiz)).toEqual([
      "Date worked out from a week number or class day",
      "No time given; due 11:59 PM",
    ]);
    expect(reviewReasons(result.assignments[0] ?? quiz)).toEqual([]);
  });

  it("keeps the grading scale, highest first", () => {
    expect(toReviewDraft(result).letter_scale?.map((l) => l.letter)).toEqual(["A", "B", "F"]);
  });

  it("checking or excluding an item clears its review flag", () => {
    const [first] = toReviewDraft(result).items;
    if (!first) throw new Error("fixture");
    expect(needsReview(first)).toBe(true);
    expect(needsReview({ ...first, checked: true })).toBe(false);
    expect(needsReview({ ...first, excluded: true })).toBe(false);
  });

  it("builds the commit payload in UTC, dropping excluded items", () => {
    const draft = toReviewDraft(result);
    draft.items = draft.items.map((i) => (i.title === "Lab 3" ? { ...i, excluded: true } : i));
    const out = draftToPayload(draft);
    if (!out.ok) throw new Error(JSON.stringify(out.issues));
    expect(out.payload.course).toMatchObject({
      name: "Biology",
      code: "BIO 201",
      instructor: null,
    });
    const byTitle = Object.fromEntries(out.payload.assignments.map((a) => [a.title, a.due_at]));
    expect(Object.keys(byTitle)).not.toContain("Lab 3");
    expect(byTitle["HW 1"]).toBe("2027-01-20T15:00:00.000Z"); // 9:00 AM CST
    expect(byTitle["Quiz week 5"]).toBe("2027-02-13T05:59:00.000Z"); // default 11:59 PM
    expect(byTitle["Final project"]).toBeNull();
    expect(out.payload.meetings).toEqual([
      { weekday: "tue", start_time: "10:00", end_time: "10:50", kind: "lecture", location: null },
    ]);
  });

  it("ties validation issues back to the item or category", () => {
    const draft = toReviewDraft(result);
    const target = draft.items[1];
    if (!target) throw new Error("fixture");
    draft.items[1] = { ...target, title: "  ", category_name: "Labs" };
    const cat = draft.categories[1];
    if (!cat) throw new Error("fixture");
    draft.categories[1] = { ...cat, name: "homework" };
    const out = draftToPayload(draft);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.issues.some((i) => i.itemKey === target.key && i.path.endsWith("title"))).toBe(true);
    expect(out.issues.some((i) => i.categoryKey === cat.key)).toBe(true);
  });

  it("sums category weights", () => {
    expect(totalWeight(toReviewDraft(result).categories)).toBe(100);
  });
});
