import { describe, expect, it } from "vitest";

import { buildReviewPlan } from "./index.ts";

const tz = "America/New_York";
const exam = { assignmentId: "mid", courseId: "c", dueAt: "2027-03-18T14:00:00Z" }; // Thu Mar 18, 10:00 EDT

describe("buildReviewPlan", () => {
  it("schedules reviews 7, 3, and 1 days before the exam at the study time", () => {
    const blocks = buildReviewPlan([exam], { timezone: tz, now: new Date("2027-03-01T12:00:00Z") });
    expect(blocks.map((b) => [b.daysBefore, b.startsAt, b.minutes])).toEqual([
      [7, "2027-03-11T21:00:00.000Z", 45], // 16:00 EST (before the DST switch)
      [3, "2027-03-15T20:00:00.000Z", 60], // 16:00 EDT
      [1, "2027-03-17T20:00:00.000Z", 90],
    ]);
  });

  it("skips sessions already in the past", () => {
    const blocks = buildReviewPlan([exam], { timezone: tz, now: new Date("2027-03-16T12:00:00Z") });
    expect(blocks.map((b) => b.daysBefore)).toEqual([1]);
  });

  it("honours a custom start time and schedule, and ignores past exams", () => {
    const blocks = buildReviewPlan(
      [exam, { assignmentId: "old", courseId: "c", dueAt: "2027-02-01T14:00:00Z" }],
      {
        timezone: tz,
        now: new Date("2027-03-01T12:00:00Z"),
        startTime: "09:30",
        sessions: [{ daysBefore: 2, minutes: 30 }],
      },
    );
    expect(blocks).toEqual([
      {
        assignmentId: "mid",
        courseId: "c",
        daysBefore: 2,
        startsAt: "2027-03-16T13:30:00.000Z",
        endsAt: "2027-03-16T14:00:00.000Z",
        minutes: 30,
      },
    ]);
  });

  it("stacks sessions for two exams on the same day instead of overlapping them", () => {
    const other = { assignmentId: "lab", courseId: "c2", dueAt: "2027-03-22T14:00:00Z" }; // 7 days before = Mar 15
    const blocks = buildReviewPlan([exam, other], {
      timezone: tz,
      now: new Date("2027-03-01T12:00:00Z"),
    });
    const mar15 = blocks.filter((b) => b.startsAt.startsWith("2027-03-15"));
    expect(mar15.map((b) => [b.assignmentId, b.startsAt, b.endsAt])).toEqual([
      ["mid", "2027-03-15T20:00:00.000Z", "2027-03-15T21:00:00.000Z"],
      ["lab", "2027-03-15T21:10:00.000Z", "2027-03-15T21:55:00.000Z"],
    ]);
  });
});
