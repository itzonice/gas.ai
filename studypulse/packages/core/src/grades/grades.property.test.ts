// Property-based tests for grade math (fast-check).
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { currentGrade } from "./current.ts";
import { gradeNeeded } from "./needed.ts";
import { gradeIfRemainingScored } from "./projection.ts";
import type { GradeInput } from "./types.ts";
import { whatIf } from "./what-if.ts";

const CLOSE = 1e-6;

/** A course with 1-4 weighted categories and 0-8 items, some ungraded, extra credit allowed. */
const courseArb = fc
  .record({
    weights: fc.array(fc.integer({ min: 1, max: 60 }), { minLength: 1, maxLength: 4 }),
    drops: fc.array(fc.integer({ min: 0, max: 2 }), { minLength: 4, maxLength: 4 }),
    items: fc.array(
      fc.record({
        category: fc.nat({ max: 3 }),
        possible: fc.constantFrom(5, 10, 20, 25, 50, 100),
        ratio: fc.option(fc.double({ min: 0, max: 1.2, noNaN: true }), { nil: null, freq: 4 }),
      }),
      { maxLength: 8 },
    ),
  })
  .map(({ weights, drops, items }): GradeInput => ({
    categories: weights.map((weight, i) => ({
      id: `c${String(i)}`,
      name: `C${String(i)}`,
      weight,
      dropLowest: drops[i] ?? 0,
    })),
    assignments: items.map((it, i) => ({
      id: `a${String(i)}`,
      categoryId: `c${String(it.category % weights.length)}`,
      pointsPossible: it.possible,
      pointsEarned: it.ratio === null ? null : Math.round(it.ratio * it.possible * 100) / 100,
    })),
  }));

const withoutDrops = (input: GradeInput): GradeInput => ({
  ...input,
  categories: input.categories.map((c) => ({ ...c, dropLowest: 0 })),
});

describe("currentGrade properties", () => {
  it("lies between the lowest and highest category percent", () => {
    fc.assert(
      fc.property(courseArb, (input) => {
        const g = currentGrade(input);
        const pcts = g.categories.flatMap((c) =>
          c.percent !== null && c.weight > 0 ? [c.percent] : [],
        );
        if (g.percent === null) return pcts.length === 0;
        return g.percent >= Math.min(...pcts) - CLOSE && g.percent <= Math.max(...pcts) + CLOSE;
      }),
    );
  });

  it("doesn't depend on item order or on scaling all weights", () => {
    fc.assert(
      fc.property(courseArb, fc.integer({ min: 2, max: 7 }), (input, k) => {
        const base = currentGrade(input).percent;
        const reversed = currentGrade({
          ...input,
          assignments: [...input.assignments].reverse(),
        }).percent;
        const scaled = currentGrade({
          ...input,
          categories: input.categories.map((c) => ({ ...c, weight: c.weight * k })),
        }).percent;
        for (const other of [reversed, scaled]) {
          if (base === null) expect(other).toBeNull();
          else expect(other).toBeCloseTo(base, 9);
        }
      }),
    );
  });

  it("doesn't change when a category's points are scaled together", () => {
    fc.assert(
      fc.property(courseArb, fc.integer({ min: 2, max: 5 }), (input, k) => {
        const scaled: GradeInput = {
          ...input,
          assignments: input.assignments.map((a) =>
            a.categoryId === "c0"
              ? {
                  ...a,
                  pointsPossible: (a.pointsPossible ?? 0) * k,
                  pointsEarned: a.pointsEarned === null ? null : a.pointsEarned * k,
                }
              : a,
          ),
        };
        const a = currentGrade(input).percent;
        const b = currentGrade(scaled).percent;
        if (a === null) expect(b).toBeNull();
        else expect(b).toBeCloseTo(a, 9);
      }),
    );
  });

  it("ignores ungraded work", () => {
    fc.assert(
      fc.property(courseArb, (input) => {
        const more: GradeInput = {
          ...input,
          assignments: [
            ...input.assignments,
            { id: "new", categoryId: "c0", pointsEarned: null, pointsPossible: 100 },
          ],
        };
        expect(currentGrade(more).percent).toEqual(currentGrade(input).percent);
      }),
    );
  });

  it("never goes down when a score goes up", () => {
    fc.assert(
      fc.property(
        courseArb,
        fc.nat(),
        fc.double({ min: 0, max: 20, noNaN: true }),
        (input, pick, bump) => {
          const graded = input.assignments.filter((a) => a.pointsEarned !== null);
          fc.pre(graded.length > 0);
          const target = graded[pick % graded.length]!;
          const raised: GradeInput = {
            ...input,
            assignments: input.assignments.map((a) =>
              a.id === target.id ? { ...a, pointsEarned: (a.pointsEarned ?? 0) + bump } : a,
            ),
          };
          expect(currentGrade(raised).percent ?? 0).toBeGreaterThanOrEqual(
            (currentGrade(input).percent ?? 0) - CLOSE,
          );
        },
      ),
    );
  });

  it("dropping lowest scores never lowers a category", () => {
    fc.assert(
      fc.property(courseArb, (input) => {
        const withDrop = currentGrade(input).categories;
        const noDrop = currentGrade(withoutDrops(input)).categories;
        withDrop.forEach((c, i) => {
          const base = noDrop[i]?.percent;
          if (c.percent !== null && base !== null && base !== undefined)
            expect(c.percent).toBeGreaterThanOrEqual(base - CLOSE);
        });
      }),
    );
  });
});

describe("whatIf properties", () => {
  it("re-applying the current scores changes nothing", () => {
    fc.assert(
      fc.property(courseArb, (input) => {
        const same = Object.fromEntries(
          input.assignments.flatMap((a) =>
            a.pointsEarned === null ? [] : [[a.id, { points: a.pointsEarned }]],
          ),
        );
        const r = whatIf(input, same);
        if (r.current.percent === null) expect(r.projected.percent).toBeNull();
        else expect(r.projected.percent).toBeCloseTo(r.current.percent, 9);
      }),
    );
  });
});

describe("gradeNeeded properties", () => {
  it("is consistent with the projection it reports", () => {
    fc.assert(
      fc.property(courseArb, fc.double({ min: 0, max: 105, noNaN: true }), (input, target) => {
        const r = gradeNeeded(input, target);
        switch (r.status) {
          case "secured":
            expect(r.worstCasePercent ?? 0).toBeGreaterThanOrEqual(target - 1e-5);
            break;
          case "reachable": {
            const reached =
              gradeIfRemainingScored(input, (r.requiredPercent ?? 0) / 100).percent ?? 0;
            expect(reached).toBeGreaterThanOrEqual(target - 1e-5);
            expect(r.requiredPercent ?? 0).toBeLessThanOrEqual(100 + 1e-6);
            // A little less wouldn't be enough.
            const slightlyLess =
              gradeIfRemainingScored(input, Math.max(0, (r.requiredPercent ?? 0) / 100 - 1e-3))
                .percent ?? 0;
            expect(slightlyLess).toBeLessThanOrEqual(target + 1e-5);
            break;
          }
          case "impossible":
            expect(r.bestCasePercent ?? 0).toBeLessThan(target + 1e-5);
            break;
          case "no_remaining_work":
            expect(r.remainingCount).toBe(0);
            break;
        }
      }),
    );
  });
});
