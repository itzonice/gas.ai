import { readFileSync } from "node:fs";

import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { CURRENT_PROMPT, PROMPTS, aiSyllabusSchemaV1, aiSyllabusSchemaV2 } from "./index.ts";

function everyObject(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
  if (Array.isArray(node))
    node.forEach((n) => {
      everyObject(n, visit);
    });
  else if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (obj.type === "object") visit(obj);
    Object.values(obj).forEach((v) => {
      everyObject(v, visit);
    });
  }
}

describe("prompt registry", () => {
  it("keys each prompt by its own version string", () => {
    for (const [key, prompt] of Object.entries(PROMPTS)) expect(prompt.version).toBe(key);
    expect(CURRENT_PROMPT.version).toBe("syllabus-v2");
  });

  it.each([
    ["v1", aiSyllabusSchemaV1],
    ["v2", aiSyllabusSchemaV2],
  ] as const)(
    "checked-in %s/schema.json matches the zod schema (run `pnpm parser:schema`)",
    (dir, schema) => {
      const onDisk: unknown = JSON.parse(
        readFileSync(new URL(`./${dir}/schema.json`, import.meta.url), "utf8"),
      );
      expect(onDisk).toEqual(z.toJSONSchema(schema));
    },
  );

  it("v2 adds class meetings to v1 without changing v1", () => {
    const v1 = PROMPTS["syllabus-v1"].system;
    const v2 = PROMPTS["syllabus-v2"].system;
    expect(v1).not.toContain("Class meetings");
    expect(v2).toContain("Class meetings:");
    expect(v2.replace(/Class meetings:[^\n]*\n\n/, "")).toBe(v1);
    expect(Object.keys(aiSyllabusSchemaV2.shape)).toEqual([
      ...Object.keys(aiSyllabusSchemaV1.shape),
      "meetings",
    ]);
  });

  it("converts to a structured-output format with closed objects", () => {
    const format = betaZodOutputFormat(aiSyllabusSchemaV2);
    expect(format.type).toBe("json_schema");
    let objects = 0;
    everyObject(format.schema, (obj) => {
      objects++;
      expect(obj.additionalProperties).toBe(false);
    });
    expect(objects).toBeGreaterThanOrEqual(5);
  });
});

describe("buildUserMessage", () => {
  it("puts the timezone, today, and term dates before the syllabus", () => {
    const msg = CURRENT_PROMPT.buildUserMessage("--- Page 1 ---\nBIO 201", {
      timezone: "America/Chicago",
      today: "2026-12-01",
      termStart: "2027-01-12",
      termEnd: "2027-05-08",
    });
    expect(msg).toContain("timezone: America/Chicago");
    expect(msg).toContain("term_start: 2027-01-12");
    expect(msg).toContain("prefer them over dates in the syllabus");
    expect(msg.indexOf("<context>")).toBeLessThan(msg.indexOf("<syllabus>"));
    expect(msg.endsWith("BIO 201\n</syllabus>")).toBe(true);
  });

  it("marks unknown term dates and chunk position", () => {
    const msg = CURRENT_PROMPT.buildUserMessage("x", {
      timezone: "UTC",
      today: "2026-09-01",
      chunk: { index: 1, total: 3, heading: "Schedule" },
    });
    expect(msg).toContain("term_start: unknown");
    expect(msg).toContain("part 2 of 3");
    expect(msg).toContain("section: Schedule");
  });
});

describe("aiSyllabusSchemaV1", () => {
  const valid = {
    course: {
      name: "Cell Biology",
      code: "BIO 201",
      instructor: null,
      term_start: "2027-01-12",
      term_end: null,
    },
    categories: [{ name: "Exams", weight: 50, drop_lowest: null }],
    assignments: [
      {
        title: "Midterm Exam",
        kind: "exam",
        category_name: "Exams",
        due_date: "2027-03-04",
        due_time: "10:00",
        points_possible: 100,
        inferred_date: false,
        inferred_year: true,
        expanded_recurring: false,
        tbd: false,
        source_quote: "Midterm Exam: March 4 in class",
      },
    ],
    grading_scale: [{ letter: "A", min_percent: 93 }],
    warnings: [],
  };

  it("accepts a well-formed result", () => {
    expect(aiSyllabusSchemaV1.safeParse(valid).success).toBe(true);
  });

  it("rejects values the API can't constrain (checked client-side)", () => {
    const bad = structuredClone(valid);
    bad.categories[0]!.weight = 150;
    bad.assignments[0]!.due_date = "2027-02-30";
    bad.assignments[0]!.due_time = "25:00";
    const result = aiSyllabusSchemaV1.safeParse(bad);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.path.join("."))).toEqual(
      expect.arrayContaining([
        "categories.0.weight",
        "assignments.0.due_date",
        "assignments.0.due_time",
      ]),
    );
  });
});
