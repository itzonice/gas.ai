// Records how a review went on a card. The review goes through the offline outbox, so it
// is saved on the phone first and sent when there's a connection (a student can study on
// a plane). Each card's latest state is kept for the rest of the session, so rating the
// same card twice schedules from its new state.
import type { StudyCardRow } from "@studypulse/core/api";
import { nextReview, type ReviewRating, type ReviewState } from "@studypulse/core/study";
import { useCallback, useState } from "react";

import { write } from "../../lib/offline";

export const reviewStateOf = (card: StudyCardRow): ReviewState => ({
  reps: card.reps,
  intervalDays: card.interval_days,
  ease: card.ease,
  lapses: card.lapses,
});

export function useCardReviews() {
  const [states, setStates] = useState<Readonly<Record<string, ReviewState>>>({});

  const stateOf = useCallback(
    (card: StudyCardRow): ReviewState => states[card.id] ?? reviewStateOf(card),
    [states],
  );

  /** When the card would come back for a rating (shown on the rating buttons). */
  const preview = useCallback(
    (card: StudyCardRow, rating: ReviewRating, now: Date) => nextReview(stateOf(card), rating, now),
    [stateOf],
  );

  /** Saves (or queues) the review. Resolves false when it couldn't be saved at all. */
  const record = useCallback(
    async (card: StudyCardRow, rating: ReviewRating): Promise<boolean> => {
      const now = new Date();
      const state = stateOf(card);
      const next = nextReview(state, rating, now);
      setStates((s) => ({
        ...s,
        [card.id]: {
          reps: next.reps,
          intervalDays: next.intervalDays,
          ease: next.ease,
          lapses: next.lapses,
        },
      }));
      try {
        await write({
          kind: "card.review",
          id: card.id,
          rating,
          state,
          reviewedAt: now.toISOString(),
        });
        return true;
      } catch {
        return false;
      }
    },
    [stateOf],
  );

  return { stateOf, preview, record };
}
