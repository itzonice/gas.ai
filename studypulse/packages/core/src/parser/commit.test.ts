import { describe, expect, it } from "vitest";

import { commitPayloadSchema, toCommitPayload } from "./commit.ts";
import { postProcess } from "./postprocess.ts";

describe("commit payload", () => {
  const result = postProcess(
    {
      course: {
        name: "Chem",
        code: "CHEM 1",
        instructor: null,
        term_start: "2027-01-12",
        term_end: "2027-05-08",
      },
      categories: [{ name: "Labs", weight: 100, drop_lowest: null }],
      assignments: [
        {
          title: "Lab 1",
          kind: "lab",
          category_name: "Lab",
          due_date: "2027-02-01",
          due_time: null,
          points_possible: 20,
          inferred_date: false,
          inferred_year: false,
          expanded_recurring: false,
          tbd: false,
          source_quote: "",
        },
      ],
      grading_scale: [
        { letter: "B", min_percent: 80 },
        { letter: "A", min_percent: 90 },
        { letter: "F", min_percent: 0 },
      ],
      warnings: [],
    },
    { timezone: "UTC", promptVersion: "syllabus-v1", model: "m" },
  );

  it("builds a valid payload from a parse result", () => {
    const payload = toCommitPayload(result);
    expect(payload.assignments[0]).toEqual({
      title: "Lab 1",
      kind: "lab",
      category_name: "Labs",
      due_at: "2027-02-01T23:59:00.000Z",
      points_possible: 20,
    });
    expect(payload.course.letter_scale).toEqual([
      { letter: "A", min: 90 },
      { letter: "B", min: 80 },
      { letter: "F", min: 0 },
    ]);
    expect(commitPayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("reports unknown categories, duplicate names, and reversed terms by field", () => {
    const payload = toCommitPayload(result);
    payload.categories.push({ name: "labs", weight: 0 });
    payload.assignments[0]!.category_name = "Quizzes";
    payload.course.term_end = "2026-12-01";
    const issues =
      commitPayloadSchema.safeParse(payload).error?.issues.map((i) => i.path.join(".")) ?? [];
    expect(issues).toEqual(
      expect.arrayContaining([
        "categories.1.name",
        "assignments.0.category_name",
        "course.term_end",
      ]),
    );
  });
});
