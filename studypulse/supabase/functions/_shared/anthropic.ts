import Anthropic from "@anthropic-ai/sdk";

import { env } from "./env.ts";
import { providerFetch } from "./resilience.ts";
import { ParseFailure } from "./syllabus/errors.ts";

let client: Anthropic | undefined;

/** The shared client, or null when no API key is configured. */
export function anthropicOrNull(): Anthropic | null {
  const apiKey = env().ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  // Transport retries (at most 3 attempts, jittered backoff) and the provider breaker live
  // in providerFetch; the SDK's own retries are off so they don't multiply.
  client ??= new Anthropic({
    apiKey,
    maxRetries: 0,
    fetch: providerFetch("anthropic", { idempotent: true }),
  });
  return client;
}

export function anthropic(): Anthropic {
  const ai = anthropicOrNull();
  if (!ai)
    throw new ParseFailure("Syllabus parsing is temporarily unavailable.", "ai_not_configured");
  return ai;
}
