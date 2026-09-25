// The notes -> cards AI call (server only). Output is validated with zod by
// callStructured, then cleaned up by cleanCards() before anything is saved.
import type Anthropic from "@anthropic-ai/sdk";

import { callStructured, type AiUsage, type Effort } from "../parser/ai.ts";
import {
  aiCardsSchema,
  buildCardsMessage,
  CARDS_PROMPT_VERSION,
  CARDS_SYSTEM_PROMPT,
  cleanCards,
  generateCardsInputSchema,
  type GenerateCardsInput,
  type GeneratedCard,
} from "./notes.ts";

export * from "./notes.ts";

export interface GenerateCardsResult {
  cards: GeneratedCard[];
  skippedReason: string | null;
  promptVersion: string;
  usage: AiUsage;
}

export async function generateCards(
  client: Anthropic,
  input: GenerateCardsInput,
  options: { model?: string; effort?: Effort; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<GenerateCardsResult> {
  const { notes, maxCards, courseLabel } = generateCardsInputSchema.parse(input);
  const { data, usage } = await callStructured({
    client,
    ...(options.model ? { model: options.model } : {}),
    system: CARDS_SYSTEM_PROMPT,
    cacheSystem: true,
    content: [{ type: "text", text: buildCardsMessage(notes, maxCards, courseLabel) }],
    schema: aiCardsSchema,
    effort: options.effort ?? "low",
    maxTokens: 8000,
    timeoutMs: options.timeoutMs ?? 60_000,
    attempts: 2,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const cards = cleanCards(data, maxCards);
  return {
    cards,
    skippedReason:
      data.skipped_reason ??
      (cards.length === 0 ? "No testable ideas found in these notes." : null),
    promptVersion: CARDS_PROMPT_VERSION,
    usage,
  };
}
