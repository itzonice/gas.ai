// Spaced review: when a card should come back, from how the student just did on it. A
// simplified SM-2 (the method behind Anki):
//
//   again  missed it: back to the start, shown again in 10 minutes, and the card gets
//          a little "harder" (lower ease)
//   hard   got it with effort: a short step forward
//   good   got it: 1 day, then 3 days, then the last gap times the card's ease
//   easy   knew it at once: a bigger step, and the card gets "easier"
//
// Gaps never pass a year. Pure, so web and mobile schedule identically; the database
// only stores the result and checks its ranges.

export type ReviewRating = "again" | "hard" | "good" | "easy";
export const REVIEW_RATINGS: readonly ReviewRating[] = ["again", "hard", "good", "easy"];

export interface ReviewState {
  /** Successful reviews in a row. */
  reps: number;
  /** Days between the last two reviews (0 for a new or just-missed card). */
  intervalDays: number;
  /** How quickly gaps grow for this card (1.3 hard to 3.0 easy). */
  ease: number;
  /** Times a learned card was missed. */
  lapses: number;
}

export interface ReviewUpdate extends ReviewState {
  /** ISO instants (UTC). */
  dueAt: string;
  lastReviewedAt: string;
}

export const NEW_CARD_STATE: ReviewState = { reps: 0, intervalDays: 0, ease: 2.5, lapses: 0 };
export const MIN_EASE = 1.3;
export const MAX_EASE = 3;
export const MAX_INTERVAL_DAYS = 365;
/** A missed card comes back this soon. */
export const RELEARN_MINUTES = 10;
/** A card with at least this gap counts as "known". */
export const KNOWN_INTERVAL_DAYS = 7;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const finiteOr = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const roundEase = (ease: number) => Math.round(clamp(ease, MIN_EASE, MAX_EASE) * 100) / 100;

/** Bad or out-of-range numbers (a stale client, a hand-edited row) fall back to safe ones. */
export function sanitizeReviewState(state: Partial<ReviewState>): ReviewState {
  return {
    reps: Math.max(0, Math.trunc(finiteOr(state.reps ?? 0, 0))),
    intervalDays: clamp(Math.trunc(finiteOr(state.intervalDays ?? 0, 0)), 0, MAX_INTERVAL_DAYS),
    ease: roundEase(finiteOr(state.ease ?? NEW_CARD_STATE.ease, NEW_CARD_STATE.ease)),
    lapses: Math.max(0, Math.trunc(finiteOr(state.lapses ?? 0, 0))),
  };
}

export function nextReview(
  current: Partial<ReviewState>,
  rating: ReviewRating,
  now: Date,
): ReviewUpdate {
  const state = sanitizeReviewState(current);
  const lastReviewedAt = now.toISOString();

  if (rating === "again") {
    return {
      reps: 0,
      intervalDays: 0,
      ease: roundEase(state.ease - 0.2),
      lapses: state.lapses + (state.reps > 0 ? 1 : 0),
      dueAt: new Date(now.getTime() + RELEARN_MINUTES * MINUTE_MS).toISOString(),
      lastReviewedAt,
    };
  }

  const first = state.reps === 0;
  const previous = state.intervalDays;
  // "Good" sets the pace; "hard" never goes past it and "easy" always goes beyond it. No
  // successful review ever shortens the gap the card already had.
  const good = Math.max(
    previous,
    first
      ? 1
      : state.reps === 1
        ? Math.max(3, previous + 1)
        : Math.max(previous + 1, Math.round(previous * state.ease)),
  );
  let interval = good;
  let ease = state.ease;
  if (rating === "hard") {
    interval = Math.max(
      previous,
      Math.min(good, first ? 1 : Math.max(previous + 1, Math.round(previous * 1.2))),
    );
    ease -= 0.15;
  } else if (rating === "easy") {
    interval = Math.max(
      good + 1,
      first ? 4 : Math.max(previous + 2, Math.round(previous * state.ease * 1.3)),
    );
    ease += 0.15;
  }
  interval = clamp(interval, 1, MAX_INTERVAL_DAYS);

  return {
    reps: state.reps + 1,
    intervalDays: interval,
    ease: roundEase(ease),
    lapses: state.lapses,
    dueAt: new Date(now.getTime() + interval * DAY_MS).toISOString(),
    lastReviewedAt,
  };
}

export type Mastery = "new" | "learning" | "known";

/** How well a card is known, in words (never color alone). */
export function masteryOf(card: {
  last_reviewed_at: string | null;
  interval_days: number;
}): Mastery {
  if (card.last_reviewed_at === null) return "new";
  return card.interval_days >= KNOWN_INTERVAL_DAYS ? "known" : "learning";
}

export const MASTERY_LABELS: Record<Mastery, string> = {
  new: "New",
  learning: "Still learning",
  known: "Known",
};

/** Whether a card is due for review at `now` (new cards are not "due"; they're new). */
export function isDue(card: { due_at: string | null }, now: Date): boolean {
  return card.due_at !== null && Date.parse(card.due_at) <= now.getTime();
}

/** "in 10 minutes", "tomorrow", "in 3 days", "in 2 weeks", "in 4 months". */
export function describeGap(update: Pick<ReviewUpdate, "intervalDays">): string {
  const days = update.intervalDays;
  if (days <= 0) return `in ${String(RELEARN_MINUTES)} minutes`;
  if (days === 1) return "tomorrow";
  if (days < 14) return `in ${String(days)} days`;
  if (days < 60) return `in ${String(Math.round(days / 7))} weeks`;
  if (days < 365) return `in ${String(Math.round(days / 30))} months`;
  return "in a year";
}
