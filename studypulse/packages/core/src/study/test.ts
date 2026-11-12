// Test mode: a one-off quiz built from a set, answered in one go, then graded with every
// answer shown. No timer and no time limit (WCAG 2.2.1). Pure; pass a seeded Rng in tests.
import {
  gradeResponse,
  makeQuestion,
  type AnswerSide,
  type Graded,
  type Question,
  type QuestionResponse,
  type QuestionType,
  type StudyCard,
} from "./questions.ts";
import { shuffle, type Rng } from "./rng.ts";

export type TestQuestionType = Exclude<QuestionType, "selfcheck">;
export const TEST_QUESTION_TYPES: readonly TestQuestionType[] = ["choice", "truefalse", "written"];
export const TEST_TYPE_LABELS: Record<TestQuestionType, string> = {
  choice: "Multiple choice",
  truefalse: "True or false",
  written: "Written",
};

export interface TestOptions {
  /** How many questions (capped at the number of cards). */
  count: number;
  types: readonly TestQuestionType[];
  side: AnswerSide;
}

export const DEFAULT_TEST_OPTIONS: TestOptions = {
  count: 20,
  types: ["choice", "truefalse", "written"],
  side: "back",
};
export const MAX_TEST_QUESTIONS = 50;

/**
 * Builds the questions: random cards, question types dealt in turn. A type the set can't
 * support falls back (see makeQuestion), and a test never asks for a self-check: long
 * answers with nothing to choose between are asked as written.
 */
export function buildTest(
  cards: readonly StudyCard[],
  options: Partial<TestOptions> = {},
  rng: Rng = Math.random,
): Question[] {
  const opts = { ...DEFAULT_TEST_OPTIONS, ...options };
  const types = opts.types.length ? opts.types : DEFAULT_TEST_OPTIONS.types;
  const usable = cards.filter((c) => c.front.trim() && c.back.trim());
  const count = Math.min(Math.max(1, Math.trunc(opts.count)), MAX_TEST_QUESTIONS, usable.length);
  return shuffle(usable, rng)
    .slice(0, count)
    .map((card, i) => {
      const wanted = types[i % types.length] ?? "choice";
      const question = makeQuestion(wanted, card, usable, opts.side, rng);
      return question.type === "selfcheck" ? { ...question, type: "written" as const } : question;
    });
}

export interface TestResult extends Graded {
  question: Question;
  response: QuestionResponse;
  /** The response in words, for the review list ("True", the option's text, what was typed). */
  responseText: string;
}

export interface TestScore {
  correct: number;
  total: number;
  /** 0-100, rounded. */
  percent: number;
  results: TestResult[];
}

function responseText(question: Question, response: QuestionResponse): string {
  if (response === null || response === "") return "No answer";
  if (question.type === "choice") {
    return question.options.find((o) => o.id === response)?.text ?? "No answer";
  }
  if (typeof response === "boolean") return response ? "True" : "False";
  return response;
}

export function gradeTest(
  questions: readonly Question[],
  responses: readonly QuestionResponse[],
): TestScore {
  const results = questions.map((question, i) => {
    const response = responses[i] ?? null;
    return {
      question,
      response,
      responseText: responseText(question, response),
      ...gradeResponse(question, response),
    };
  });
  const correct = results.filter((r) => r.correct).length;
  return {
    correct,
    total: results.length,
    percent: results.length ? Math.round((correct / results.length) * 100) : 0,
    results,
  };
}

/** How many questions were answered (for "3 unanswered, submit anyway?"). */
export function answeredCount(responses: readonly QuestionResponse[]): number {
  return responses.filter((r) => r !== null && r !== "").length;
}
