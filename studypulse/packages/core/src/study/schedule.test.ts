import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  describeGap,
  isDue,
  masteryOf,
  MAX_EASE,
  MAX_INTERVAL_DAYS,
  MIN_EASE,
  NEW_CARD_STATE,
  nextReview,
  REVIEW_RATINGS,
  sanitizeReviewState,
  type ReviewRating,
  type ReviewState,
} from "./schedule.ts";

const now = new Date("2027-03-01T15:00:00Z");
const DAY = 86_400_000;
const daysUntil = (iso: string) => (Date.parse(iso) - now.getTime()) / DAY;

describe("nextReview", () => {
  it("grows the gap with each good review: 1 day, 3 days, then by the card's ease", () => {
    const first = nextReview(NEW_CARD_STATE, "good", now);
    expect(first).toMatchObject({ reps: 1, intervalDays: 1, ease: 2.5, lapses: 0 });
    expect(daysUntil(first.dueAt)).toBe(1);
    const second = nextReview(first, "good", now);
    expect(second).toMatchObject({ reps: 2, intervalDays: 3 });
    const third = nextReview(second, "good", now);
    expect(third).toMatchObject({ reps: 3, intervalDays: 8 }); // round(3 * 2.5)
    expect(third.lastReviewedAt).toBe(now.toISOString());
  });

  it("brings a missed card back in 10 minutes and counts the lapse", () => {
    const learned: ReviewState = { reps: 4, intervalDays: 20, ease: 2.5, lapses: 0 };
    const missed = nextReview(learned, "again", now);
    expect(missed).toMatchObject({ reps: 0, intervalDays: 0, ease: 2.3, lapses: 1 });
    expect(Date.parse(missed.dueAt) - now.getTime()).toBe(10 * 60_000);
    // Missing a card that was never learned isn't a lapse.
    expect(nextReview(NEW_CARD_STATE, "again", now).lapses).toBe(0);
  });

  it("steps less for hard and more for easy, and moves the ease", () => {
    const state: ReviewState = { reps: 3, intervalDays: 10, ease: 2.5, lapses: 0 };
    expect(nextReview(state, "hard", now)).toMatchObject({ intervalDays: 12, ease: 2.35 });
    expect(nextReview(state, "good", now)).toMatchObject({ intervalDays: 25, ease: 2.5 });
    expect(nextReview(state, "easy", now)).toMatchObject({ intervalDays: 33, ease: 2.65 });
    expect(nextReview(NEW_CARD_STATE, "easy", now).intervalDays).toBe(4);
    expect(nextReview(NEW_CARD_STATE, "hard", now).intervalDays).toBe(1);
  });

  it("never schedules past a year or lets the ease leave its range", () => {
    const old: ReviewState = { reps: 12, intervalDays: 300, ease: 3, lapses: 0 };
    expect(nextReview(old, "easy", now)).toMatchObject({ intervalDays: 365, ease: 3 });
    const hard: ReviewState = { reps: 0, intervalDays: 0, ease: 1.3, lapses: 9 };
    expect(nextReview(hard, "again", now).ease).toBe(1.3);
  });

  it("treats bad numbers as a new card instead of producing NaN dates", () => {
    const broken = {
      reps: Number.NaN,
      intervalDays: -5,
      ease: Number.POSITIVE_INFINITY,
      lapses: -1,
    };
    expect(sanitizeReviewState(broken)).toEqual({ reps: 0, intervalDays: 0, ease: 2.5, lapses: 0 });
    const next = nextReview(broken, "good", now);
    expect(next.intervalDays).toBe(1);
    expect(Number.isNaN(Date.parse(next.dueAt))).toBe(false);
    expect(nextReview({}, "good", now).intervalDays).toBe(1);
  });
});

describe("nextReview properties", () => {
  const stateArb = fc.record({
    reps: fc.integer({ min: 0, max: 60 }),
    intervalDays: fc.integer({ min: 0, max: MAX_INTERVAL_DAYS }),
    ease: fc.double({ min: MIN_EASE, max: MAX_EASE, noNaN: true }),
    lapses: fc.integer({ min: 0, max: 40 }),
  });
  const ratingArb = fc.constantFrom<ReviewRating>(...REVIEW_RATINGS);

  it("always stays inside what the database allows", () => {
    fc.assert(
      fc.property(stateArb, ratingArb, (state, rating) => {
        const next = nextReview(state, rating, now);
        return (
          Number.isInteger(next.intervalDays) &&
          next.intervalDays >= 0 &&
          next.intervalDays <= MAX_INTERVAL_DAYS &&
          next.ease >= MIN_EASE &&
          next.ease <= MAX_EASE &&
          Number.isInteger(next.reps) &&
          next.reps >= 0 &&
          next.lapses >= state.lapses &&
          Date.parse(next.dueAt) > now.getTime()
        );
      }),
    );
  });

  it("orders the ratings: hard <= good <= easy, and again is soonest", () => {
    fc.assert(
      fc.property(stateArb, (state) => {
        const due = (r: ReviewRating) => Date.parse(nextReview(state, r, now).dueAt);
        return (
          due("again") < due("hard") && due("hard") <= due("good") && due("good") <= due("easy")
        );
      }),
    );
  });

  it("never shortens the gap after a successful review (below the cap)", () => {
    fc.assert(
      fc.property(
        stateArb,
        fc.constantFrom<ReviewRating>("hard", "good", "easy"),
        (state, rating) => {
          const next = nextReview(state, rating, now);
          return (
            next.intervalDays >= Math.min(state.intervalDays, MAX_INTERVAL_DAYS) &&
            next.reps === state.reps + 1
          );
        },
      ),
    );
  });

  it("is settled by any sequence of ratings without errors", () => {
    fc.assert(
      fc.property(fc.array(ratingArb, { maxLength: 40 }), (ratings) => {
        let state: ReviewState = NEW_CARD_STATE;
        for (const rating of ratings) state = nextReview(state, rating, now);
        return state.intervalDays <= MAX_INTERVAL_DAYS && state.ease >= MIN_EASE;
      }),
    );
  });
});

describe("labels", () => {
  it("says how well a card is known", () => {
    expect(masteryOf({ last_reviewed_at: null, interval_days: 0 })).toBe("new");
    expect(masteryOf({ last_reviewed_at: now.toISOString(), interval_days: 3 })).toBe("learning");
    expect(masteryOf({ last_reviewed_at: now.toISOString(), interval_days: 7 })).toBe("known");
  });

  it("knows when a card is due (new cards are new, not due)", () => {
    expect(isDue({ due_at: null }, now)).toBe(false);
    expect(isDue({ due_at: new Date(now.getTime() - 1).toISOString() }, now)).toBe(true);
    expect(isDue({ due_at: new Date(now.getTime() + 60_000).toISOString() }, now)).toBe(false);
  });

  it("describes the gap in words", () => {
    expect(describeGap({ intervalDays: 0 })).toBe("in 10 minutes");
    expect(describeGap({ intervalDays: 1 })).toBe("tomorrow");
    expect(describeGap({ intervalDays: 3 })).toBe("in 3 days");
    expect(describeGap({ intervalDays: 21 })).toBe("in 3 weeks");
    expect(describeGap({ intervalDays: 90 })).toBe("in 3 months");
    expect(describeGap({ intervalDays: 365 })).toBe("in a year");
  });
});
