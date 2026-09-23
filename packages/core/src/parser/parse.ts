// The syllabus parse call: page-marked text in, schema-validated extraction out.
import type Anthropic from "@anthropic-ai/sdk";

import { callStructured, type AiUsage, type Effort } from "./ai.ts";
import { chunkSyllabus, mergeChunkResults, syllabusPreamble } from "./chunk.ts";
import {
  CURRENT_PROMPT,
  PROMPTS,
  type PromptContext,
  type PromptVersion,
} from "./prompts/index.ts";
import type { AiSyllabusV1 } from "./prompts/v1/schema.ts";

export interface ParseOptions {
  model?: string;
  promptVersion?: PromptVersion;
  effort?: Effort;
  /** Per-attempt timeout. Two attempts max, so keep 2x this under the function's wall clock. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ParseCallResult {
  output: AiSyllabusV1;
  promptVersion: PromptVersion;
  usage: AiUsage;
}

export async function parseSyllabusText(
  client: Anthropic,
  text: string,
  ctx: PromptContext,
  options: ParseOptions = {},
): Promise<ParseCallResult> {
  const prompt = options.promptVersion ? PROMPTS[options.promptVersion] : CURRENT_PROMPT;
  const { data, usage } = await callStructured({
    client,
    ...(options.model ? { model: options.model } : {}),
    system: prompt.system,
    cacheSystem: true,
    content: [{ type: "text", text: prompt.buildUserMessage(text, ctx) }],
    schema: prompt.schema,
    // Extraction with date arithmetic benefits from some thinking; "high" rarely helps here.
    effort: options.effort ?? "medium",
    maxTokens: 32000,
    timeoutMs: options.timeoutMs ?? 90_000,
    attempts: 2,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  return { output: data, promptVersion: prompt.version, usage };
}

/** Maximum chunks parsed at once, to stay well inside rate limits. */
export const CHUNK_CONCURRENCY = 3;

async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface SyllabusParseResult {
  output: AiSyllabusV1;
  promptVersion: PromptVersion;
  /** One entry per model call (one per chunk). */
  usage: AiUsage[];
  chunks: number;
}

/**
 * Parses a whole syllabus: one call for normal lengths, otherwise section-aligned
 * chunks parsed in parallel (each seeing the syllabus preamble) and merged. Any chunk
 * failure fails the parse, so a result is never silently missing a section.
 */
export async function parseSyllabus(
  client: Anthropic,
  text: string,
  ctx: PromptContext,
  options: ParseOptions & { chunkThreshold?: number; maxChunkChars?: number } = {},
): Promise<SyllabusParseResult> {
  const chunks = chunkSyllabus(text, {
    ...(options.chunkThreshold ? { threshold: options.chunkThreshold } : {}),
    ...(options.maxChunkChars ? { maxChars: options.maxChunkChars } : {}),
  });
  if (chunks.length === 1) {
    const single = await parseSyllabusText(client, text, ctx, options);
    return {
      output: single.output,
      promptVersion: single.promptVersion,
      usage: [single.usage],
      chunks: 1,
    };
  }

  const preamble = syllabusPreamble(text);
  const parts = await mapLimit(chunks, CHUNK_CONCURRENCY, (chunk) =>
    parseSyllabusText(client, chunk.text, { ...ctx, chunk, preamble }, options),
  );
  return {
    output: mergeChunkResults(parts.map((p) => p.output)),
    promptVersion: parts[0]?.promptVersion ?? CURRENT_PROMPT.version,
    usage: parts.map((p) => p.usage),
    chunks: chunks.length,
  };
}
