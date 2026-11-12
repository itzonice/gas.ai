// Wording for the Study screens, shared by web and mobile so both say the same thing.
// Status is always in words (never color alone).
import { describeGap, type ReviewRating, type ReviewUpdate } from "./schedule.ts";

const plural = (n: number, one: string, many = `${one}s`) => `${String(n)} ${n === 1 ? one : many}`;

/** "1 card", "24 cards". */
export const cardCountLabel = (cards: number) => plural(cards, "card");

/** "24 cards · 6 due · 10 new" (the due and new parts only when there are any). */
export function setSummary(set: { cards: number; due: number; fresh: number }): string {
  if (set.cards === 0) return "No cards yet";
  return [
    cardCountLabel(set.cards),
    set.due > 0 ? `${String(set.due)} due` : null,
    set.fresh > 0 ? `${String(set.fresh)} new` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The Study screen's "due" card. */
export function dueSummary(due: number): { value: string; detail: string } {
  if (due === 0) return { value: "0", detail: "Nothing due right now" };
  return { value: String(due), detail: `${plural(due, "card")} ready to review` };
}

/** After grading a card: "Next review tomorrow." / "You'll see this again in 10 minutes." */
export function reviewFeedback(rating: ReviewRating, update: ReviewUpdate): string {
  return rating === "again"
    ? `You'll see this again ${describeGap(update)}.`
    : `Next review ${describeGap(update)}.`;
}

/** "Card 3 of 24". */
export const positionLabel = (index: number, total: number) =>
  `Card ${String(Math.min(index + 1, Math.max(total, 1)))} of ${String(total)}`;

/** "8 of 10 correct (80%)". */
export function scoreLabel(correct: number, total: number): string {
  const percent = total ? Math.round((correct / total) * 100) : 0;
  return `${String(correct)} of ${String(total)} correct (${String(percent)}%)`;
}

/** A sentence for the end of a test, by score. */
export function scoreMessage(percent: number): string {
  if (percent >= 90) return "Excellent. You know this set.";
  if (percent >= 70) return "Good work. Review the ones you missed.";
  if (percent >= 50) return "Getting there. Another round of Learn will help.";
  return "Keep going. Try Learn on this set, then test again.";
}

/** "Saved", "Saving…", "Not saved: …" for the note editor's status line. */
export type SaveState =
  | { status: "idle" }
  | { status: "dirty" }
  | { status: "saving" }
  | { status: "saved"; at: Date }
  | { status: "error"; message: string };

export function saveStateLabel(state: SaveState): string {
  switch (state.status) {
    case "idle":
      return "";
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving…";
    case "saved":
      return "Saved";
    case "error":
      return `Not saved: ${state.message}`;
  }
}

export const STUDY_MODES = [
  {
    id: "flashcards",
    label: "Flashcards",
    description: "Flip through the cards and sort what you know.",
    minCards: 1,
  },
  {
    id: "learn",
    label: "Learn",
    description: "Answer questions until you've mastered every card.",
    minCards: 1,
  },
  {
    id: "test",
    label: "Test",
    description: "Take a practice test and see your score.",
    minCards: 1,
  },
  {
    id: "match",
    label: "Match",
    description: "Pair terms with definitions against the clock.",
    minCards: 2,
  },
] as const;
export type StudyModeId = (typeof STUDY_MODES)[number]["id"];
