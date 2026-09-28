import { describe, expect, it } from "vitest";

import { assignmentConfidence } from "./confidence.ts";
import { postProcess } from "./postprocess.ts";
import type { AiAssignmentV1 } from "./prompts/index.ts";
import type { AssignmentFlags } from "./result.ts";

const none: AssignmentFlags = {
  inferred_date: false,
  inferred_year: false,
  expanded_recurring: false,
  tbd: false,
  default_time: false,
  category_unmatched: false,
};

describe("assignmentConfidence", () => {
  const known = { termKnown: true };
  it("is high for printed dates, even with an assumed time or a year inside a known term", () => {
    expect(assignmentConfidence(none, known)).toBe("high");
    expect(assignmentConfidence({ ...none, default_time: true, inferred_year: true }, known)).toBe(
      "high",
    );
  });

  it("is medium for recurring expansions and years guessed without term dates", () => {
    expect(assignmentConfidence({ ...none, expanded_recurring: true }, known)).toBe("medium");
    expect(assignmentConfidence({ ...none, inferred_year: true }, { termKnown: false })).toBe(
      "medium",
    );
  });

  it("is low for TBD items, computed dates, and unmatched categories", () => {
    expect(assignmentConfidence({ ...none, tbd: true }, known)).toBe("low");
    expect(assignmentConfidence({ ...none, inferred_date: true }, known)).toBe("low");
    expect(assignmentConfidence({ ...none, category_unmatched: true }, known)).toBe("low");
    expect(
      assignmentConfidence({ ...none, inferred_date: true, expanded_recurring: true }, known),
    ).toBe("low");
  });
});

describe("postProcess confidence", () => {
  const base: Omit<AiAssignmentV1, "title"> = {
    kind: "quiz",
    category_name: "Quizzes",
    due_date: "2027-02-05",
    due_time: null,
    points_possible: 10,
    inferred_date: false,
    inferred_year: true,
    expanded_recurring: false,
    tbd: false,
    source_quote: "",
  };

  it("stores flags, a confidence level per item, and a summary", () => {
    const result = postProcess(
      {
        course: {
          name: "Psych",
          code: null,
          instructor: null,
          term_start: "2027-01-12",
          term_end: "2027-05-08",
        },
        categories: [{ name: "Quizzes", weight: 100, drop_lowest: null }],
        assignments: [
          { ...base, title: "Quiz 1" },
          {
            ...base,
            title: "Weekly quiz 2",
            due_date: "2027-02-12",
            expanded_recurring: true,
            inferred_date: true,
          },
          { ...base, title: "Quiz 3", due_date: null, tbd: true },
        ],
        grading_scale: [],
        warnings: [],
      },
      { timezone: "UTC", promptVersion: "syllabus-v1", model: "m" },
    );
    expect(result.assignments.map((a) => [a.title, a.confidence])).toEqual([
      ["Quiz 1", "high"],
      ["Weekly quiz 2", "low"],
      ["Quiz 3", "low"],
    ]);
    expect(result.assignments[1]!.flags).toMatchObject({
      expanded_recurring: true,
      inferred_date: true,
      default_time: true,
    });
    expect(result.summary).toMatchObject({
      total: 3,
      high: 1,
      medium: 0,
      low: 2,
      expanded_recurring: 1,
      tbd: 1,
      inferred_years: 3,
    });
    expect(result.warnings.map((w) => w.code)).toContain("low_confidence_items");
  });
});
