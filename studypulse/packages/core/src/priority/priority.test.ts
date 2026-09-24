import { describe, expect, it } from "vitest";

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
    expect(midterm.score).toBeCloseTo(67.86, 1);
    expect(quiz.score).toBeCloseTo(39.89, 1);
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
