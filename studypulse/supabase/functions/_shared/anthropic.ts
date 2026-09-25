import Anthropic from "@anthropic-ai/sdk";

import { env } from "./env.ts";
import { ParseFailure } from "./syllabus/errors.ts";

let client: Anthropic | undefined;

/** The shared client, or null when no API key is configured. */
export function anthropicOrNull(): Anthropic | null {
  const apiKey = env().ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  client ??= new Anthropic({ apiKey });
  return client;
}

export function anthropic(): Anthropic {
  const ai = anthropicOrNull();
  if (!ai)
    throw new ParseFailure("Syllabus parsing is temporarily unavailable.", "ai_not_configured");
  return ai;
}
