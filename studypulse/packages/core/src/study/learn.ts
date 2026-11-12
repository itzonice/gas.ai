// Learn mode: works through a set until every card is mastered. A card is asked as
// multiple choice first; once that's right it comes back as a typed answer (or a second
// multiple choice when typing is off, or a self-check when the answer is too long to
// type). Right twice in a row means mastered; a miss sends the card back to the start and
// to the end of the current round, so it's asked again before the round ends.
//
// A pure state machine shared by web and mobile: the screen shows `current`, calls
// answerLearn, shows the feedback, then calls continueLearn.
import {
  answerOf,
  gradeResponse,
  makeQuestion,
  type AnswerSide,
  type Graded,
  type Question,
  type QuestionResponse,
  type StudyCard,
} from "./questions.ts";
import { shuffle, type Rng } from "./rng.ts";
import type { ReviewRating } from "./schedule.ts";

export interface LearnOptions {
  side: AnswerSide;
  /** Ask the second pass as a typed answer (off: multiple choice both times). */
  written: boolean;
  /** Cards per round. */
  roundSize: number;
}

export const DEFAULT_LEARN_OPTIONS: LearnOptions = { side: "back", written: true, roundSize: 7 };

/** 0 not yet right, 1 right once, 2 mastered. */
export type LearnStage = 0 | 1 | 2;

export interface LearnCardProgress {
  stage: LearnStage;
  /** Wrong answers in this session. */
  misses: number;
}

export interface LearnState {
  cards: readonly StudyCard[];
  options: LearnOptions;
  progress: Readonly<Record<string, LearnCardProgress>>;
  /** Card ids still to ask in this round, next first. */
  queue: readonly string[];
  round: number;
  current: Question | null;
  /** Set after an answer until continueLearn is called. */
  feedback: LearnFeedback | null;
  /** True between rounds: show the round summary, then continueLearn starts the next. */
  roundComplete: boolean;
  done: boolean;
}

export interface LearnFeedback extends Graded {
  cardId: string;
  /** What the student gave (an option id, typed text, or their own verdict). */
  response: QuestionResponse;
  /**
   * What to record for spaced review when the student moves on, if anything (see
   * ratingFor). Read it at "Continue", after any "I was right" override.
   */
  rating: ReviewRating | null;
  /** The card's stage after this answer. */
  stage: LearnStage;
  /** The card's progress before this answer (what an override starts again from). */
  before: LearnCardProgress;
}

const byId = (cards: readonly StudyCard[], id: string) => cards.find((c) => c.id === id);

function questionFor(
  state: Omit<LearnState, "current">,
  cardId: string,
  rng: Rng,
): Question | null {
  const card = byId(state.cards, cardId);
  if (!card) return null;
  const stage = state.progress[cardId]?.stage ?? 0;
  const type = stage === 0 || !state.options.written ? "choice" : "written";
  return makeQuestion(type, card, state.cards, state.options.side, rng);
}

/** The next round: the cards furthest from mastery first, a round's worth, shuffled. */
function nextQueue(
  cards: readonly StudyCard[],
  progress: Readonly<Record<string, LearnCardProgress>>,
  roundSize: number,
  rng: Rng,
): string[] {
  const open = shuffle(
    cards.filter((c) => (progress[c.id]?.stage ?? 0) < 2),
    rng,
  ).sort((a, b) => (progress[b.id]?.stage ?? 0) - (progress[a.id]?.stage ?? 0));
  return shuffle(
    open.slice(0, Math.max(1, roundSize)).map((c) => c.id),
    rng,
  );
}

export function startLearn(
  cards: readonly StudyCard[],
  options: Partial<LearnOptions> = {},
  rng: Rng = Math.random,
): LearnState {
  const opts = { ...DEFAULT_LEARN_OPTIONS, ...options };
  const usable = cards.filter((c) => c.front.trim() && c.back.trim());
  const progress = Object.fromEntries(
    usable.map((c) => [c.id, { stage: 0, misses: 0 } satisfies LearnCardProgress]),
  );
  const base = {
    cards: usable,
    options: opts,
    progress,
    queue: nextQueue(usable, progress, opts.roundSize, rng),
    round: 1,
    feedback: null,
    roundComplete: false,
    done: usable.length === 0,
  };
  const first = base.queue[0];
  return { ...base, current: first ? questionFor(base, first, rng) : null };
}

/**
 * What an answer means for spaced review: the first miss of a card in a session records
 * "again"; mastering it records "good" (no misses) or "hard" (it took more than one try).
 */
function ratingFor(before: LearnCardProgress, correct: boolean, stage: LearnStage) {
  if (!correct) return before.misses === 0 ? ("again" as const) : null;
  if (stage < 2) return null;
  return before.misses === 0 ? ("good" as const) : ("hard" as const);
}

/** Grades the response to the current question. Call continueLearn to move on. */
export function answerLearn(state: LearnState, response: QuestionResponse): LearnState {
  const question = state.current;
  if (!question || state.feedback) return state;
  const graded = gradeResponse(question, response);
  const before = state.progress[question.cardId] ?? { stage: 0, misses: 0 };
  const stage: LearnStage = graded.correct ? (before.stage === 0 ? 1 : 2) : 0;
  const progress = {
    ...state.progress,
    [question.cardId]: { stage, misses: before.misses + (graded.correct ? 0 : 1) },
  };
  const rest = state.queue.slice(1);
  return {
    ...state,
    progress,
    // A missed card is asked again before the round ends.
    queue: graded.correct ? rest : [...rest, question.cardId],
    feedback: {
      ...graded,
      cardId: question.cardId,
      response,
      rating: ratingFor(before, graded.correct, stage),
      stage,
      before,
    },
  };
}

/**
 * "I was right": turns the last wrong answer into a right one (a typo the checker didn't
 * forgive, or another way of saying the same thing).
 */
export function overrideLearn(state: LearnState): LearnState {
  const feedback = state.feedback;
  if (!feedback || feedback.correct) return state;
  const { before } = feedback;
  const stage: LearnStage = before.stage === 0 ? 1 : 2;
  // Take the card back out of the end of the round, where the miss put it.
  const queue = [...state.queue];
  const requeued = queue.lastIndexOf(feedback.cardId);
  if (requeued >= 0) queue.splice(requeued, 1);
  return {
    ...state,
    progress: { ...state.progress, [feedback.cardId]: { stage, misses: before.misses } },
    queue,
    feedback: {
      ...feedback,
      correct: true,
      verdict: "correct",
      rating: ratingFor(before, true, stage),
      stage,
    },
  };
}

/** Moves to the next question, the round summary, the next round, or the end. */
export function continueLearn(state: LearnState, rng: Rng = Math.random): LearnState {
  if (state.done) return state;
  if (state.roundComplete) {
    const queue = nextQueue(state.cards, state.progress, state.options.roundSize, rng);
    const base = { ...state, queue, round: state.round + 1, roundComplete: false, feedback: null };
    const first = queue[0];
    return { ...base, current: first ? questionFor(base, first, rng) : null };
  }
  if (!state.feedback) return state;
  const base = { ...state, feedback: null };
  const next = state.queue[0];
  if (next) return { ...base, current: questionFor(base, next, rng) };
  const done = state.cards.every((c) => (state.progress[c.id]?.stage ?? 0) === 2);
  return { ...base, current: null, roundComplete: !done, done };
}

export interface LearnSummary {
  total: number;
  mastered: number;
  /** Right once, still to be asked again. */
  familiar: number;
  remaining: number;
  round: number;
}

export function learnSummary(state: LearnState): LearnSummary {
  const stages = state.cards.map((c) => state.progress[c.id]?.stage ?? 0);
  const mastered = stages.filter((s) => s === 2).length;
  const familiar = stages.filter((s) => s === 1).length;
  return {
    total: stages.length,
    mastered,
    familiar,
    remaining: stages.length - mastered,
    round: state.round,
  };
}

/** The answer to show for a card, on the side being answered. */
export function learnAnswer(state: LearnState, cardId: string): string {
  const card = byId(state.cards, cardId);
  return card ? answerOf(card, state.options.side) : "";
}
