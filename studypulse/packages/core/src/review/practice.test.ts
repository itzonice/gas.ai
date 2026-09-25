import { describe, expect, it } from "vitest";

import { buildPracticeQuizPlan, practiceQuizDates } from "./practice.ts";

const course = { courseId: "c1", termStart: null, termEnd: null };
const tz = "America/Chicago";

describe("practiceQuizDates", () => {
  it("is weekly (Fridays) without an exam", () => {
    // 2027-03-01 is a Monday.
    expect(practiceQuizDates(course, [], "2027-03-01", 20)).toEqual([
      "2027-03-05",
      "2027-03-12",
      "2027-03-19",
    ]);
  });

  it("goes twice weekly (Tuesdays too) in the 14 days before an exam, never on exam day", () => {
    // Exam Friday 2027-03-26: ramp covers 03-12 .. 03-25.
    expect(practiceQuizDates(course, ["2027-03-26"], "2027-03-01", 27)).toEqual([
      "2027-03-05", // weekly
      "2027-03-12", // weekly (inside the ramp)
      "2027-03-16", // extra Tuesday
      "2027-03-19",
      "2027-03-23", // extra Tuesday
      // 03-26 is the exam day: skipped
    ]);
  });

  it("stays inside the term", () => {
    expect(
      practiceQuizDates(
        { courseId: "c1", termStart: "2027-03-08", termEnd: "2027-03-15" },
        [],
        "2027-03-01",
        20,
      ),
    ).toEqual(["2027-03-12"]);
  });
});

describe("buildPracticeQuizPlan", () => {
  const now = new Date("2027-03-01T15:00:00Z"); // Monday 9:00 AM in Chicago

  it("places quizzes at the study start time, stacking courses and skipping booked time", () => {
    const blocks = buildPracticeQuizPlan(
      [course, { courseId: "c2", termStart: null, termEnd: null }],
      [],
      {
        timezone: tz,
        now,
        horizonDays: 6,
        startTime: "16:00",
        // A review from 4:00 to 5:00 PM on Friday.
        busy: [{ startsAt: "2027-03-05T22:00:00Z", endsAt: "2027-03-05T23:00:00Z" }],
      },
    );
    expect(blocks).toEqual([
      {
        courseId: "c1",
        date: "2027-03-05",
        startsAt: "2027-03-05T23:10:00.000Z", // 5:10 PM, after the review
        endsAt: "2027-03-05T23:30:00.000Z",
        minutes: 20,
      },
      {
        courseId: "c2",
        date: "2027-03-05",
        startsAt: "2027-03-05T23:40:00.000Z",
        endsAt: "2027-03-06T00:00:00.000Z",
        minutes: 20,
      },
    ]);
  });

  it("ignores past exams and past times", () => {
    const blocks = buildPracticeQuizPlan(
      [course],
      [{ courseId: "c1", dueAt: "2027-02-20T15:00:00Z" }],
      {
        timezone: tz,
        now: new Date("2027-03-05T23:00:00Z"), // Friday 5:00 PM, after today's 4:00 PM slot
        horizonDays: 7,
      },
    );
    expect(blocks.map((b) => b.date)).toEqual(["2027-03-12"]);
  });
});
