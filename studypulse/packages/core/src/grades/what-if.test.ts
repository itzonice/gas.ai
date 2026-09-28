import { describe, expect, it } from "vitest";

import type { GradeInput } from "./types.ts";
import { whatIf } from "./what-if.ts";

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

const course: GradeInput = {
  categories: [
    { id: "exams", name: "Exams", weight: 60 },
    { id: "hw", name: "Homework", weight: 40 },
  ],
  assignments: [
    item("mid", "exams", 80, 100),
    item("final", "exams", null, 100),
    item("hw1", "hw", 90, 100),
    item("hw2", "hw", null, 50),
  ],
};

describe("whatIf", () => {
  it("projects the grade from hypothetical percents and points", () => {
    const r = whatIf(course, { final: { percent: 90 }, hw2: { points: 50 } });
    // exams (80+90)/200 = 85%, hw (90+50)/150 = 93.33%  ->  0.6*85 + 0.4*93.33 = 88.33
    expect(r.projected.percent).toBeCloseTo(88.333, 2);
    expect(r.current.percent).toBeCloseTo(0.6 * 80 + 0.4 * 90);
    expect(r.change).toBeCloseTo(88.333 - 84, 2);
  });

  it("leaves ungraded items without a hypothetical out of the projection", () => {
    const r = whatIf(course, { hw2: { percent: 100 } });
    expect(r.projected.percent).toBeCloseTo(0.6 * 80 + 0.4 * (140 / 150) * 100);
  });

  it("replaces an existing score and reports unknown ids", () => {
    const r = whatIf(course, { mid: { percent: 100 }, nope: { percent: 50 } });
    expect(r.projected.percent).toBeCloseTo(0.6 * 100 + 0.4 * 90);
    expect(r.unknownIds).toEqual(["nope"]);
  });

  it("includes a category that had no grades before", () => {
    const input: GradeInput = {
      ...course,
      assignments: [item("final", "exams", null, 100), item("hw1", "hw", 90, 100)],
    };
    const r = whatIf(input, { final: { percent: 70 } });
    expect(r.current.percent).toBeCloseTo(90);
    expect(r.projected.percent).toBeCloseTo(0.6 * 70 + 0.4 * 90);
  });

  it("returns no change when there are no hypotheticals", () => {
    expect(whatIf(course, {}).change).toBe(0);
  });
});
