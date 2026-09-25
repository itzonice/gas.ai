// Notes -> atomic retrieval cards (prompt 72): the prompt, schemas, and clean-up. Pure,
// so clients can share the limits; the AI call itself is in generate.ts (server only).
// One idea per card, phrased as a question the student answers from memory.
import { z } from "zod";

import type { Card } from "./index.ts";

export const CARDS_PROMPT_VERSION = "cards-v1";
export const MIN_NOTES_CHARS = 40;
export const MAX_NOTES_CHARS = 30_000;
export const DEFAULT_CARD_COUNT = 12;
export const MAX_CARD_COUNT = 20;

export const CARDS_SYSTEM_PROMPT = `You turn a student's class notes into retrieval-practice flashcards. The student will answer each card from memory, so every card must test one idea.

Rules for each card:
- One fact, definition, relationship, step, or cause per card. If a sentence holds two ideas, make two cards or pick the more important one.
- The front is a question ending in "?", answerable without seeing the notes. Ask "why" and "how" as well as "what" when the notes explain reasons or mechanisms.
- The back is the shortest complete answer: a word, a phrase, or at most two sentences. No "see notes", no restating the question.
- Use only what the notes say. Never add facts, examples, or numbers that aren't in them. If the notes are wrong or unclear, skip that part.
- Keep the student's terminology and notation. Write formulas in plain text (e.g. "F = m * a").
- No yes/no questions, no "list all X" questions, and no two cards that ask the same thing.

Pick the ideas most worth remembering for an exam, up to the requested number. If the notes don't contain enough substance for that many good cards, return fewer. If they contain nothing testable (e.g. only logistics), return no cards and say why in skipped_reason.`;

export const aiCardsSchema = z.object({
  cards: z.array(
    z.object({
      question: z.string().describe("The front: one question ending in '?'"),
      answer: z.string().describe("The back: the shortest complete answer"),
      topic: z.string().nullable().describe("A 1-3 word topic from the notes, for tagging"),
    }),
  ),
  skipped_reason: z
    .string()
    .nullable()
    .describe("Why there are fewer cards than requested, or null"),
});
export type AiCards = z.infer<typeof aiCardsSchema>;

export const generateCardsInputSchema = z.object({
  notes: z
    .string()
    .trim()
    .min(MIN_NOTES_CHARS, "Add a few more lines of notes first")
    .max(MAX_NOTES_CHARS, "Notes are too long; split them into parts"),
  maxCards: z.number().int().min(1).max(MAX_CARD_COUNT).default(DEFAULT_CARD_COUNT),
  /** Course name or code, so the model knows the subject. */
  courseLabel: z.string().trim().max(200).optional(),
});
export type GenerateCardsInput = z.input<typeof generateCardsInputSchema>;

export interface GeneratedCard extends Card {
  front: string;
  back: string;
  tags: string[];
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/** Cleans the model's cards: trims, ends questions with "?", drops empties, duplicates, and extras. */
export function cleanCards(output: AiCards, maxCards: number): GeneratedCard[] {
  const seen = new Set<string>();
  const out: GeneratedCard[] = [];
  for (const c of output.cards) {
    let front = c.question.replace(/\s+/g, " ").trim();
    const back = c.answer.trim();
    if (!front || !back) continue;
    if (!front.endsWith("?")) front = `${front.replace(/[.:;]+$/, "")}?`;
    const key = normalize(front);
    if (seen.has(key) || normalize(back) === key) continue;
    seen.add(key);
    const topic = c.topic?.trim();
    out.push({
      front: front.slice(0, 2000),
      back: back.slice(0, 5000),
      tags: topic ? [topic.slice(0, 50)] : [],
    });
    if (out.length >= maxCards) break;
  }
  return out;
}

export function buildCardsMessage(notes: string, maxCards: number, courseLabel?: string): string {
  return [
    "<context>",
    `course: ${courseLabel ?? "unknown"}`,
    `cards_wanted: up to ${String(maxCards)}`,
    "</context>",
    "",
    "<notes>",
    notes,
    "</notes>",
  ].join("\n");
}
