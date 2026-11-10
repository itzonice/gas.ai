"use client";

// Records how a review went on a card and keeps each card's latest review state for the
// rest of the session, so rating the same card twice schedules from its new state.
import type { StudyCardRow } from "@studypulse/core/api";
import { nextReview, type ReviewRating, type ReviewState } from "@studypulse/core/study";
import { useCallback, useState } from "react";

import { useApi } from "@/components/auth/SessionProvider";

export const reviewStateOf = (card: StudyCardRow): ReviewState => ({
  reps: card.reps,
  intervalDays: card.interval_days,
  ease: card.ease,
  lapses: card.lapses,
});

export function useReviewRecorder() {
  const api = useApi();
  const [states, setStates] = useState<Readonly<Record<string, ReviewState>>>({});

  const stateOf = useCallback(
    (card: StudyCardRow): ReviewState => states[card.id] ?? reviewStateOf(card),
    [states],
  );

  /** Saves the review. Resolves false when it couldn't be saved (the session goes on). */
  const record = useCallback(
    async (card: StudyCardRow, rating: ReviewRating): Promise<boolean> => {
      try {
        const saved = await api.cards.review({
          id: card.id,
          rating,
          state: states[card.id] ?? reviewStateOf(card),
        });
        setStates((s) => ({ ...s, [card.id]: reviewStateOf(saved) }));
        return true;
      } catch {
        return false;
      }
    },
    [api, states],
  );

  /** When a card would come back for each rating, from its current state. */
  const preview = useCallback(
    (card: StudyCardRow, rating: ReviewRating, now: Date) => nextReview(stateOf(card), rating, now),
    [stateOf],
  );

  return { stateOf, record, preview };
}
