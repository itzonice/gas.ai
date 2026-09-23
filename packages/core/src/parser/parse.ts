// The syllabus parse call: page-marked text in, schema-validated extraction out.
import type Anthropic from "@anthropic-ai/sdk";

import { callStructured, type AiUsage, type Effort } from "./ai.ts";
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
