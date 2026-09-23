import { describe, expect, it } from "vitest";

import { dedupeAssignments, normalizeTitle, toUtc } from "./dates.ts";
import { postProcess } from "./postprocess.ts";
import type { AiAssignmentV1, AiSyllabusV1 } from "./prompts/index.ts";
import { parseResultSchema } from "./result.ts";

function item(overrides: Partial<AiAssignmentV1>): AiAssignmentV1 {
  return {
    title: "Item",
    kind: "assignment",
    category_name: null,
    due_date: "2027-02-01",
    due_time: null,
    points_possible: null,
    inferred_date: false,
    inferred_year: false,
    expanded_recurring: false,
    tbd: false,
    source_quote: "",
    ...overrides,
  };
}

function syllabus(
  assignments: AiAssignmentV1[],
  term: [string | null, string | null] = ["2027-01-12", "2027-05-08"],
): AiSyllabusV1 {
  return {
    course: {
      name: "Biology",
      code: null,
      instructor: null,
      term_start: term[0],
      term_end: term[1],
    },
    categories: [],
    assignments,
    grading_scale: [],
    warnings: [],
  };
}

const ctx = { timezone: "America/Chicago", promptVersion: "syllabus-v1", model: "claude-opus-5" };

describe("toUtc", () => {
  it("defaults a missing time to 23:59 local and flags it", () => {
    const a = toUtc(item({ due_date: "2027-02-01" }), "America/Chicago");
    expect(a.due_at).toBe("2027-02-02T05:59:00.000Z");
    expect(a.default_time).toBe(true);
  });

  it("keeps an explicit time and honours DST", () => {
    expect(
      toUtc(item({ due_date: "2027-04-01", due_time: "09:30" }), "America/Chicago").due_at,
    ).toBe("2027-04-01T14:30:00.000Z");
  });

  it("leaves undated items undated", () => {
    expect(toUtc(item({ due_date: null, due_time: "10:00", tbd: true }), "UTC")).toMatchObject({
      due_at: null,
      due_time: null,
    });
  });
});

describe("dedupeAssignments", () => {
  it("treats titles that differ only in case, punctuation, or numbering as the same", () => {
    expect(normalizeTitle("Problem Set #01")).toBe(normalizeTitle("problem set 1"));
    expect(normalizeTitle("The Midterm Exam")).toBe(normalizeTitle("Midterm exam."));
    expect(normalizeTitle("Lab No. 3")).toBe(normalizeTitle("Lab 3"));
  });

  it("keeps the more specific copy of a duplicate", () => {
    const vague = toUtc(item({ title: "Midterm", due_date: "2027-03-04" }), "UTC");
    const exact = toUtc(
      item({ title: "midterm", due_date: "2027-03-04", due_time: "10:00" }),
      "UTC",
    );
    const { kept, dropped } = dedupeAssignments([vague, exact]);
    expect(kept).toHaveLength(1);
    expect(kept[0]!.due_time).toBe("10:00");
    expect(dropped).toEqual([
      { title: "Midterm", due_date_local: "2027-03-04", reason: "duplicate" },
    ]);
  });

  it("drops an undated copy when a dated one exists, but keeps same-title items on different dates", () => {
    const items = [
      toUtc(item({ title: "Final Exam", due_date: null, tbd: true }), "UTC"),
      toUtc(item({ title: "Final Exam", due_date: "2027-05-11" }), "UTC"),
      toUtc(item({ title: "Reading response", due_date: "2027-02-02" }), "UTC"),
      toUtc(item({ title: "Reading response", due_date: "2027-02-09" }), "UTC"),
    ];
    const { kept } = dedupeAssignments(items);
    expect(kept.map((a) => `${a.title}@${a.due_date ?? "tbd"}`)).toEqual([
      "Final Exam@2027-05-11",
      "Reading response@2027-02-02",
      "Reading response@2027-02-09",
    ]);
  });
});

describe("postProcess", () => {
  it("drops items outside the term (beyond the grace window) and records them", () => {
    const result = postProcess(
      syllabus([
        item({ title: "Pre-reading", due_date: "2027-01-08" }), // 4 days early: kept
        item({ title: "Old syllabus leftover", due_date: "2026-09-15" }),
        item({ title: "Final", due_date: "2027-05-12" }), // 4 days late: kept
        item({ title: "Next term", due_date: "2027-08-30" }),
      ]),
      ctx,
    );
    expect(result.assignments.map((a) => a.title)).toEqual(["Pre-reading", "Final"]);
    expect(result.dropped.map((d) => [d.title, d.reason])).toEqual([
      ["Old syllabus leftover", "outside_term"],
      ["Next term", "outside_term"],
    ]);
    expect(result.warnings.map((w) => w.code)).toContain("dropped_outside_term");
  });

  it("prefers the student's term dates over the syllabus", () => {
    const result = postProcess(
      syllabus([item({ due_date: "2027-06-15" })], ["2027-01-12", "2027-05-08"]),
      {
        ...ctx,
        termEndHint: "2027-06-30",
      },
    );
    expect(result.course.term_end).toBe("2027-06-30");
    expect(result.assignments).toHaveLength(1);
  });

  it("keeps everything and warns when term dates are unknown", () => {
    const result = postProcess(syllabus([item({ due_date: "2030-01-01" })], [null, null]), ctx);
    expect(result.assignments).toHaveLength(1);
    expect(result.warnings.map((w) => w.code)).toContain("term_dates_missing");
  });

  it("sorts by due date with TBD items last and produces a valid ParseResult", () => {
    const result = postProcess(
      syllabus([
        item({ title: "TBD project", due_date: null, tbd: true }),
        item({ title: "B", due_date: "2027-03-01" }),
        item({ title: "A", due_date: "2027-02-01", due_time: "09:00" }),
      ]),
      ctx,
    );
    expect(result.assignments.map((a) => a.title)).toEqual(["A", "B", "TBD project"]);
    expect(result.assignments[2]!.flags.tbd).toBe(true);
    expect(parseResultSchema.safeParse(result).success).toBe(true);
  });
});
