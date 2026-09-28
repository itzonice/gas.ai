// Property-based tests for the priority score (fast-check).
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { priority, type PriorityInput, type TaskStatus } from "./index.ts";

const now = new Date("2027-03-01T15:00:00Z");
const inputArb = fc.record({
  gradeShare: fc.double({ min: 0, max: 100, noNaN: true }),
  dueInDays: fc.option(fc.double({ min: -10, max: 60, noNaN: true }), { nil: null, freq: 6 }),
  minutesRemaining: fc.integer({ min: 0, max: 2000 }),
  status: fc.constantFrom<TaskStatus>("todo", "in_progress", "done", "skipped"),
  dailyMinutes: fc.integer({ min: 15, max: 600 }),
});
interface RawInput {
  gradeShare: number;
  dueInDays: number | null;
  minutesRemaining: number;
  status: TaskStatus;
  dailyMinutes: number;
}
const toInput = (x: RawInput): PriorityInput => ({
  gradeShare: x.gradeShare,
  dueAt: x.dueInDays === null ? null : new Date(now.getTime() + x.dueInDays * 86_400_000),
  now,
  minutesRemaining: x.minutesRemaining,
  status: x.status,
  dailyMinutes: x.dailyMinutes,
});

describe("priority properties", () => {
  it("scores between 0 and 100", () => {
    fc.assert(
      fc.property(inputArb, (x) => {
        const { score } = priority(toInput(x));
        return score >= 0 && score <= 100;
      }),
    );
  });

  it("finished tasks score 0", () => {
    fc.assert(
      fc.property(inputArb, fc.constantFrom<TaskStatus>("done", "skipped"), (x, status) => {
        expect(priority(toInput({ ...x, status })).score).toBe(0);
      }),
    );
  });

  it("never drops as the grade share rises", () => {
    fc.assert(
      fc.property(inputArb, fc.double({ min: 0, max: 50, noNaN: true }), (x, more) => {
        const a = priority(toInput(x)).score;
        const b = priority(toInput({ ...x, gradeShare: Math.min(100, x.gradeShare + more) })).score;
        expect(b).toBeGreaterThanOrEqual(a - 1e-9);
      }),
    );
  });

  it("never rises as the due date moves later", () => {
    fc.assert(
      fc.property(inputArb, fc.double({ min: 0, max: 30, noNaN: true }), (x, later) => {
        fc.pre(x.dueInDays !== null);
        const a = priority(toInput(x)).score;
        const b = priority(toInput({ ...x, dueInDays: x.dueInDays + later })).score;
        expect(b).toBeLessThanOrEqual(a + 1e-9);
      }),
    );
  });

  it("never drops as the remaining work grows", () => {
    fc.assert(
      fc.property(inputArb, fc.integer({ min: 0, max: 1000 }), (x, more) => {
        const a = priority(toInput(x)).score;
        const b = priority(toInput({ ...x, minutesRemaining: x.minutesRemaining + more })).score;
        expect(b).toBeGreaterThanOrEqual(a - 1e-9);
      }),
    );
  });

  it("in-progress work never ranks below the same work not started", () => {
    fc.assert(
      fc.property(inputArb, (x) => {
        const todo = priority(toInput({ ...x, status: "todo" })).score;
        const started = priority(toInput({ ...x, status: "in_progress" })).score;
        expect(started).toBeGreaterThanOrEqual(todo - 1e-9);
      }),
    );
  });

  it("an item worth 15x the grade share, due within a week, outranks one due tomorrow", () => {
    // Generalization of the midterm-vs-quiz rule for moderately sized work.
    fc.assert(
      fc.property(
        fc.double({ min: 1, max: 2, noNaN: true }),
        fc.double({ min: 3, max: 6, noNaN: true }),
        (smallShare, bigDue) => {
          const big = priority({
            gradeShare: smallShare * 15,
            dueAt: new Date(now.getTime() + bigDue * 86_400_000),
            now,
            minutesRemaining: 300,
            status: "todo",
          });
          const small = priority({
            gradeShare: smallShare,
            dueAt: new Date(now.getTime() + 86_400_000),
            now,
            minutesRemaining: 30,
            status: "todo",
          });
          expect(big.score).toBeGreaterThan(small.score);
        },
      ),
    );
  });
});
