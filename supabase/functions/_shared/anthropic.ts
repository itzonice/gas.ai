import Anthropic from "@anthropic-ai/sdk";

import { env } from "./env.ts";
import { ParseFailure } from "./syllabus/errors.ts";

let client: Anthropic | undefined;

export function anthropic(): Anthropic {
  const apiKey = env().ANTHROPIC_API_KEY;
  if (!apiKey)
    throw new ParseFailure("Syllabus parsing is temporarily unavailable.", "ai_not_configured");
  client ??= new Anthropic({ apiKey });
  return client;
}
