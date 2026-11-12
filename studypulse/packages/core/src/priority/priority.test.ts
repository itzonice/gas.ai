import { describe, expect, it } from "vitest";

import { PRIORITY_FIXTURES } from "./fixtures.ts";
import { gradeShare, minutesRemaining, priority } from "./index.ts";

const now = new Date("2027-03-01T15:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * 86_400_000).toISOString();

describe("priority", () => {
  it("ranks a 30% midterm due in 5 days above a 2% quiz due tomorrow", () => {
    const midterm = priority({
      gradeShare: 30,
      dueAt: inDays(5),
      now,
      minutesRemaining: 300,
      status: "todo",
    });
    const quiz = priority({
      gradeShare: 2,
      dueAt: inDays(1),
      now,
      minutesRemaining: 30,
      status: "todo",
    });
    expect(midterm.score).toBeGreaterThan(quiz.score);
    // Dated, weighted work sits in the 10-90 band: 10 + 80 * blend.
    expect(midterm.score).toBeCloseTo(64.29, 1);
    expect(quiz.score).toBeCloseTo(41.91, 1);
  });

  it("still puts a small task due in hours above a big one weeks away", () => {
    const quizToday = priority({
      gradeShare: 2,
      dueAt: inDays(0.125),
      now,
      minutesRemaining: 30,
      status: "todo",
    });
    const finalLater = priority({
      gradeShare: 30,
      dueAt: inDays(21),
      now,
      minutesRemaining: 300,
      status: "todo",
    });
    expect(quizToday.score).toBeGreaterThan(finalLater.score);
  });

  it("raises urgency when the work no longer fits before the deadline", () => {
    const light = priority({
      gradeShare: 10,
      dueAt: inDays(4),
      now,
      minutesRemaining: 60,
      status: "todo",
    });
    const heavy = priority({
      gradeShare: 10,
      dueAt: inDays(4),
      now,
      minutesRemaining: 600,
      status: "todo",
    });
    expect(heavy.urgency).toBe(1);
    expect(heavy.score).toBeGreaterThan(light.score);
  });

  it("zeroes finished tasks and boosts in-progress ones", () => {
    const base = { gradeShare: 10, dueAt: inDays(3), now, minutesRemaining: 60 };
    expect(priority({ ...base, status: "done" }).score).toBe(0);
    expect(priority({ ...base, status: "skipped" }).score).toBe(0);
    expect(priority({ ...base, status: "in_progress" }).score).toBeGreaterThan(
      priority({ ...base, status: "todo" }).score,
    );
  });

  it("treats overdue work as maximally urgent and undated work as barely urgent", () => {
    const overdue = priority({
      gradeShare: 5,
      dueAt: inDays(-1),
      now,
      minutesRemaining: 60,
      status: "todo",
    });
    expect(overdue).toMatchObject({ urgency: 1, overdue: true });
    expect(
      priority({ gradeShare: 5, dueAt: null, now, minutesRemaining: 60, status: "todo" }).urgency,
    ).toBe(0.05);
  });
});

describe("priority bands", () => {
  const scored = PRIORITY_FIXTURES.map((f) => ({
    ...f,
    ...priority({
      gradeShare: f.gradeShare,
      dueAt: f.dueInDays === null ? null : inDays(f.dueInDays),
      now,
      minutesRemaining: f.minutesRemaining,
      status: f.status,
      dailyMinutes: f.dailyMinutes,
    }),
  }));
  const open = scored.filter((f) => f.status === "todo" || f.status === "in_progress");

  it("scores every fixture as a number from 0 to 100", () => {
    for (const f of scored) {
      expect(Number.isFinite(f.score), f.name).toBe(true);
      expect(f.score, f.name).toBeGreaterThanOrEqual(0);
      expect(f.score, f.name).toBeLessThanOrEqual(100);
    }
  });

  it("puts every open overdue task above every task that isn't overdue", () => {
    const overdue = open.filter((f) => f.dueInDays !== null && f.dueInDays < 0);
    const rest = open.filter((f) => !(f.dueInDays !== null && f.dueInDays < 0));
    expect(overdue.length).toBeGreaterThanOrEqual(6);
    const lowestOverdue = Math.min(...overdue.map((f) => f.score));
    const highestRest = Math.max(...rest.map((f) => f.score));
    expect(lowestOverdue).toBeGreaterThan(highestRest);
    expect(overdue.every((f) => f.band === "overdue")).toBe(true);
  });

  it("ranks undated and unweighted work below all dated, weighted work", () => {
    const upcoming = open.filter((f) => f.dueInDays === null || f.dueInDays >= 0);
    const weighted = upcoming.filter((f) => f.dueInDays !== null && f.gradeShare > 0);
    const low = upcoming.filter((f) => f.dueInDays === null || f.gradeShare === 0);
    expect(low.length).toBeGreaterThanOrEqual(5);
    expect(Math.max(...low.map((f) => f.score))).toBeLessThan(
      Math.min(...weighted.map((f) => f.score)),
    );
  });

  it("scores done and skipped work 0, even when overdue", () => {
    for (const f of scored.filter((x) => x.status === "done" || x.status === "skipped")) {
      expect(f.score, f.name).toBe(0);
      expect(f.band).toBe("finished");
    }
  });

  it("gives in-progress work a small boost within its band", () => {
    const todo = scored.find((f) => f.name === "10% in 3 days, not started");
    const doing = scored.find((f) => f.name === "in progress");
    expect(doing?.score).toBeGreaterThan(todo?.score ?? Infinity);
    expect((doing?.score ?? 0) - (todo?.score ?? 0)).toBeLessThan(10);
  });

  it("treats non-finite inputs as missing instead of returning NaN", () => {
    const weird = priority({
      gradeShare: Number.NaN,
      dueAt: "not a date",
      now,
      minutesRemaining: Number.POSITIVE_INFINITY,
      status: "todo",
      dailyMinutes: Number.NaN,
    });
    expect(weird).toMatchObject({ band: "low", daysUntilDue: null });
    expect(Number.isFinite(weird.score)).toBe(true);
    expect(
      priority({
        gradeShare: Infinity,
        dueAt: inDays(1),
        now,
        minutesRemaining: 30,
        status: "todo",
      }).score,
    ).toBeLessThanOrEqual(90);
  });
});

describe("gradeShare", () => {
  const categories = [
    { id: "exams", weight: 60 },
    { id: "quiz", weight: 40 },
  ];
  const items = [
    { id: "mid", categoryId: "exams", pointsPossible: 100 },
    { id: "final", categoryId: "exams", pointsPossible: 200 },
    { id: "q1", categoryId: "quiz", pointsPossible: 10 },
    { id: "q2", categoryId: "quiz", pointsPossible: null },
    { id: "loose", categoryId: null, pointsPossible: 50 },
  ];

  it("splits category weight by points", () => {
    expect(gradeShare("mid", categories, items)).toBeCloseTo(20);
    expect(gradeShare("final", categories, items)).toBeCloseTo(40);
    expect(gradeShare("q1", categories, items)).toBeCloseTo(20);
    expect(gradeShare("q2", categories, items)).toBeCloseTo(20); // assumed average points
    expect(gradeShare("loose", categories, items)).toBe(0);
  });

  it("renormalizes weights that don't total 100 and handles no categories", () => {
    expect(gradeShare("mid", [{ id: "exams", weight: 30 }], items.slice(0, 2))).toBeCloseTo(
      100 / 3,
    );
    expect(
      gradeShare(
        "a",
        [],
        [
          { id: "a", categoryId: null, pointsPossible: 1 },
          { id: "b", categoryId: null, pointsPossible: 3 },
        ],
      ),
    ).toBeCloseTo(25);
  });
});

describe("minutesRemaining", () => {
  it("subtracts logged time from the estimate or the kind's default", () => {
    expect(minutesRemaining(120, "assignment", 45)).toBe(75);
    expect(minutesRemaining(null, "exam", 60)).toBe(180);
    expect(minutesRemaining(30, "quiz", 90)).toBe(0);
  });
});
