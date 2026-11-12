import { describe, expect, it } from "vitest";

import { chunkSyllabus, isHeading, mergeChunkResults, syllabusPreamble } from "./chunk.ts";
import { fakeClient } from "./fake-client.ts";
import { parseSyllabus } from "./parse.ts";
import type { AiSyllabus } from "./prompts/index.ts";

const para = (n: number, label: string) =>
  Array.from(
    { length: n },
    (_, i) => `${label} line ${String(i)}: reading and discussion of chapter topics.`,
  ).join("\n");

describe("isHeading", () => {
  it.each([
    "COURSE SCHEDULE",
    "Grading",
    "3. Course Policies",
    "Week 5",
    "Tentative Schedule",
    "IV. Exams",
  ])("treats %s as a heading", (line) => {
    expect(isHeading(line)).toBe(true);
  });
  it.each([
    "--- Page 2 ---",
    "Lab 1 due Friday, January 22 at 11:59 PM",
    "The final exam is cumulative.",
    "A",
  ])("does not treat %s as a heading", (line) => {
    expect(isHeading(line)).toBe(false);
  });
});

describe("chunkSyllabus", () => {
  it("leaves short syllabi whole", () => {
    expect(chunkSyllabus("--- Page 1 ---\nshort")).toEqual([
      { index: 0, total: 1, heading: null, text: "--- Page 1 ---\nshort" },
    ]);
  });

  it("splits at section headings, packs sections, and keeps page context", () => {
    const text = [
      "--- Page 1 ---",
      "COURSE INFORMATION",
      para(20, "info"),
      "GRADING",
      para(20, "grading"),
      "--- Page 2 ---",
      "COURSE SCHEDULE",
      para(60, "schedule"),
    ].join("\n");
    const chunks = chunkSyllabus(text, { threshold: 1000, maxChars: 3500 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.total === chunks.length)).toBe(true);
    expect(chunks.every((c) => c.text.length <= 3600)).toBe(true);
    // Every line of the original survives exactly once.
    const lines = (t: string) => t.split("\n").filter((l) => l && !l.startsWith("--- Page"));
    expect(chunks.flatMap((c) => lines(c.text))).toEqual(lines(text));
    // A chunk that starts mid-page repeats the page marker.
    expect(chunks.slice(1).every((c) => c.text.startsWith("--- Page"))).toBe(true);
    expect(
      chunks.some(
        (c) => c.heading === "COURSE SCHEDULE" || c.heading?.startsWith("COURSE SCHEDULE"),
      ),
    ).toBe(true);
  });

  it("splits a single oversized section at line boundaries", () => {
    const chunks = chunkSyllabus(`SCHEDULE\n${para(200, "week")}`, {
      threshold: 1000,
      maxChars: 2000,
    });
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks[1]!.heading).toBe("SCHEDULE (continued)");
  });

  it("takes the preamble at a line break", () => {
    const pre = syllabusPreamble(para(100, "x"), 500);
    expect(pre.length).toBeLessThanOrEqual(500);
    expect(pre.endsWith("topics.")).toBe(true);
  });
});

const result = (overrides: Partial<AiSyllabus>): AiSyllabus => ({
  course: { name: "", code: null, instructor: null, term_start: null, term_end: null },
  categories: [],
  assignments: [],
  grading_scale: [],
  warnings: [],
  meetings: [],
  ...overrides,
});

describe("mergeChunkResults", () => {
  it("keeps each class meeting once across chunks", () => {
    const m = {
      weekday: "tue" as const,
      start_time: "09:00",
      end_time: "10:15",
      kind: "lecture" as const,
      location: null,
    };
    const merged = mergeChunkResults([
      result({ meetings: [m] }),
      result({ meetings: [m, { ...m, kind: "lab" }] }),
      result({}),
    ]);
    expect(merged.meetings).toEqual([m, { ...m, kind: "lab" }]);
  });

  it("takes course fields from the first chunk that has them and unions categories", () => {
    const merged = mergeChunkResults([
      result({
        course: {
          name: "Biology",
          code: "BIO 201",
          instructor: null,
          term_start: "2027-01-12",
          term_end: null,
        },
        categories: [{ name: "Quizzes", weight: null, drop_lowest: null }],
      }),
      result({
        course: {
          name: "",
          code: null,
          instructor: "Dr. O",
          term_start: null,
          term_end: "2027-05-08",
        },
        categories: [
          { name: "Quiz", weight: 20, drop_lowest: 1 },
          { name: "Exams", weight: 80, drop_lowest: null },
        ],
        warnings: ["dup"],
      }),
      result({ warnings: ["dup"], categories: [{ name: "Exams", weight: 70, drop_lowest: null }] }),
    ]);
    expect(merged.course).toEqual({
      name: "Biology",
      code: "BIO 201",
      instructor: "Dr. O",
      term_start: "2027-01-12",
      term_end: "2027-05-08",
    });
    expect(merged.categories).toEqual([
      { name: "Quiz", weight: 20, drop_lowest: 1 },
      { name: "Exams", weight: 80, drop_lowest: null },
    ]);
    expect(merged.warnings).toEqual([expect.stringContaining("both 80% and 70%"), "dup"]);
  });
});

describe("parseSyllabus", () => {
  it("parses long syllabi in chunks, gives later chunks the preamble, and merges", async () => {
    const text = `COURSE INFORMATION\nTerm: Jan 12 - May 8\n${para(30, "info")}\nCOURSE SCHEDULE\n${para(80, "schedule")}`;
    const replies = [
      result({
        course: {
          name: "Bio",
          code: null,
          instructor: null,
          term_start: "2027-01-12",
          term_end: "2027-05-08",
        },
      }),
      result({}),
      result({}),
      result({}),
      result({}),
      result({}),
    ].map((parsed) => ({ parsed }));
    const { client, calls } = fakeClient(replies);
    const out = await parseSyllabus(
      client,
      text,
      { timezone: "UTC", today: "2027-01-01" },
      { chunkThreshold: 1000, maxChunkChars: 3000 },
    );

    expect(out.chunks).toBeGreaterThan(1);
    expect(out.usage).toHaveLength(out.chunks);
    expect(out.output.course.name).toBe("Bio");
    const messages = calls.map(
      (c) => (c.messages as { content: { text: string }[] }[])[0]!.content[0]!.text,
    );
    expect(messages[0]).not.toContain("<syllabus_start>");
    expect(
      messages
        .slice(1)
        .every((m) => m.includes("<syllabus_start>") && m.includes("Term: Jan 12 - May 8")),
    ).toBe(true);
    expect(messages[1]).toContain(`part 2 of ${String(out.chunks)}`);
  });

  it("uses a single call for normal syllabi", async () => {
    const { client, calls } = fakeClient([
      {
        parsed: result({
          course: { name: "X", code: null, instructor: null, term_start: null, term_end: null },
        }),
      },
    ]);
    const out = await parseSyllabus(client, "short syllabus", {
      timezone: "UTC",
      today: "2027-01-01",
    });
    expect(out.chunks).toBe(1);
    expect(calls).toHaveLength(1);
  });
});
