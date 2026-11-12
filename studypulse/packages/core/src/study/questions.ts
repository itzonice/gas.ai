// Turns cards into questions for Learn and Test: multiple choice, true or false, written,
// and "self-check" (show the answer, then the student says whether they had it). Wrong
// options come from the other cards in the set. Pure; pass a seeded Rng in tests.
import { checkAnswer, isTypeable, sameAnswer, type AnswerVerdict } from "./answers.ts";
import { shuffle, type Rng } from "./rng.ts";

export interface StudyCard {
  id: string;
  front: string;
  back: string;
}

/** Which side of the card the student answers with (the other side is the prompt). */
export type AnswerSide = "back" | "front";

export const promptOf = (card: StudyCard, side: AnswerSide) =>
  side === "back" ? card.front : card.back;
export const answerOf = (card: StudyCard, side: AnswerSide) =>
  side === "back" ? card.back : card.front;

export interface ChoiceOption {
  /** The id of the card this option's text comes from. */
  id: string;
  text: string;
}

export type Question =
  | {
      type: "choice";
      cardId: string;
      prompt: string;
      options: ChoiceOption[];
      correctOptionId: string;
      answer: string;
    }
  | {
      type: "truefalse";
      cardId: string;
      prompt: string;
      /** The answer shown next to the prompt; the student says whether it's the right one. */
      shown: string;
      isTrue: boolean;
      answer: string;
    }
  | { type: "written"; cardId: string; prompt: string; answer: string }
  | { type: "selfcheck"; cardId: string; prompt: string; answer: string };

export type QuestionType = Question["type"];

/** What the student gave: an option id, true/false, typed text, or their own verdict. */
export type QuestionResponse = string | boolean | null;

/** Other cards whose answers differ from this card's and from each other. */
function distractors(
  card: StudyCard,
  pool: readonly StudyCard[],
  side: AnswerSide,
  rng: Rng,
): StudyCard[] {
  const answer = answerOf(card, side);
  const prompt = promptOf(card, side);
  const picked: StudyCard[] = [];
  for (const other of shuffle(pool, rng)) {
    if (other.id === card.id) continue;
    const text = answerOf(other, side);
    // A card with the same prompt is the same question; its answer could also be right.
    if (sameAnswer(text, answer) || sameAnswer(promptOf(other, side), prompt)) continue;
    if (picked.some((p) => sameAnswer(answerOf(p, side), text))) continue;
    picked.push(other);
  }
  return picked;
}

/** A multiple-choice question, or null when the set has no other answer to offer. */
export function choiceQuestion(
  card: StudyCard,
  pool: readonly StudyCard[],
  side: AnswerSide,
  rng: Rng,
  optionCount = 4,
): Extract<Question, { type: "choice" }> | null {
  const wrong = distractors(card, pool, side, rng).slice(0, Math.max(1, optionCount - 1));
  if (wrong.length === 0) return null;
  const options = shuffle(
    [card, ...wrong].map((c) => ({ id: c.id, text: answerOf(c, side) })),
    rng,
  );
  return {
    type: "choice",
    cardId: card.id,
    prompt: promptOf(card, side),
    options,
    correctOptionId: card.id,
    answer: answerOf(card, side),
  };
}

/** A true-or-false question, or null when there's no wrong answer to show. */
export function trueFalseQuestion(
  card: StudyCard,
  pool: readonly StudyCard[],
  side: AnswerSide,
  rng: Rng,
): Extract<Question, { type: "truefalse" }> | null {
  const wrong = distractors(card, pool, side, rng)[0];
  if (!wrong) return null;
  const isTrue = rng() < 0.5;
  return {
    type: "truefalse",
    cardId: card.id,
    prompt: promptOf(card, side),
    shown: isTrue ? answerOf(card, side) : answerOf(wrong, side),
    isTrue,
    answer: answerOf(card, side),
  };
}

export function writtenQuestion(
  card: StudyCard,
  side: AnswerSide,
): Extract<Question, { type: "written" }> {
  return {
    type: "written",
    cardId: card.id,
    prompt: promptOf(card, side),
    answer: answerOf(card, side),
  };
}

export function selfCheckQuestion(
  card: StudyCard,
  side: AnswerSide,
): Extract<Question, { type: "selfcheck" }> {
  return {
    type: "selfcheck",
    cardId: card.id,
    prompt: promptOf(card, side),
    answer: answerOf(card, side),
  };
}

/**
 * A question of the wanted type, falling back when the set can't support it: no other
 * answers means no multiple choice; a long answer isn't asked as typing.
 */
export function makeQuestion(
  type: QuestionType,
  card: StudyCard,
  pool: readonly StudyCard[],
  side: AnswerSide,
  rng: Rng,
): Question {
  const typed = () =>
    isTypeable(answerOf(card, side)) ? writtenQuestion(card, side) : selfCheckQuestion(card, side);
  if (type === "choice") return choiceQuestion(card, pool, side, rng) ?? typed();
  if (type === "truefalse") return trueFalseQuestion(card, pool, side, rng) ?? typed();
  if (type === "written") {
    return isTypeable(answerOf(card, side))
      ? writtenQuestion(card, side)
      : (choiceQuestion(card, pool, side, rng) ?? selfCheckQuestion(card, side));
  }
  return selfCheckQuestion(card, side);
}

export interface Graded {
  correct: boolean;
  /** "close" is a right answer with a small typo; it counts, and the spelling is shown. */
  verdict: AnswerVerdict;
  correctAnswer: string;
}

export function gradeResponse(question: Question, response: QuestionResponse): Graded {
  const wrong: Graded = { correct: false, verdict: "wrong", correctAnswer: question.answer };
  const right: Graded = { correct: true, verdict: "correct", correctAnswer: question.answer };
  if (response === null) return wrong;
  switch (question.type) {
    case "choice":
      return response === question.correctOptionId ? right : wrong;
    case "truefalse":
      return response === question.isTrue ? right : wrong;
    case "selfcheck":
      return response === true ? right : wrong;
    case "written": {
      if (typeof response !== "string") return wrong;
      const check = checkAnswer(question.answer, response);
      return { ...wrong, correct: check.verdict !== "wrong", verdict: check.verdict };
    }
  }
}
