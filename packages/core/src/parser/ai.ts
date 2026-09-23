// Thin, typed wrappers around the Claude API for the parser. They own the retry,
// timeout, refusal, and validation policy so callers get either valid data or an
// AiCallError that says what went wrong.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

export const DEFAULT_PARSER_MODEL = "claude-opus-5";

// Refusals are retried server-side on a fallback model chosen by refusal category.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export type Effort = "low" | "medium" | "high";

export type AiFailureKind = "refusal" | "truncated" | "invalid_output" | "timeout" | "api";

export class AiCallError extends Error {
  readonly kind: AiFailureKind;

  constructor(kind: AiFailureKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AiCallError";
    this.kind = kind;
  }
}

export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface AiCallOptions {
  client: Anthropic;
  model?: string;
  system: string;
  /** Cache the system prompt; worth it when the same long prompt is sent repeatedly. */
  cacheSystem?: boolean;
  content: Anthropic.Beta.BetaContentBlockParam[];
  effort?: Effort;
  maxTokens?: number;
  /** Per-attempt timeout; the SDK also retries 429/5xx/connection errors itself. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

function systemParam(options: AiCallOptions): string | Anthropic.Beta.BetaTextBlockParam[] {
  return options.cacheSystem
    ? [{ type: "text", text: options.system, cache_control: { type: "ephemeral" } }]
    : options.system;
}

function usageOf(message: Anthropic.Beta.BetaMessage): AiUsage {
  return {
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
  };
}

function toAiError(error: unknown): AiCallError {
  if (error instanceof AiCallError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AiCallError("timeout", "The AI request timed out", { cause: error });
  }
  if (error instanceof Anthropic.APIError) {
    return new AiCallError("api", `AI request failed (${String(error.status)})`, { cause: error });
  }
  return new AiCallError("api", "AI request failed", { cause: error });
}

function checkStop(message: Anthropic.Beta.BetaMessage): void {
  if (message.stop_reason === "refusal") {
    throw new AiCallError("refusal", "The AI declined to process this document");
  }
  if (message.stop_reason === "max_tokens") {
    throw new AiCallError("truncated", "The AI response was cut off");
  }
}

/**
 * Structured-output call: the response is constrained to `schema` and validated
 * again with zod (including refinements the API can't enforce). Invalid output is
 * retried up to `attempts` times in total; refusals and truncation are not retried.
 */
export async function callStructured<S extends z.ZodType>(
  options: AiCallOptions & { schema: S; attempts?: number },
): Promise<{ data: z.infer<S>; usage: AiUsage }> {
  const { client, schema, attempts = 2 } = options;
  let lastError: AiCallError | undefined;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const message = await client.beta.messages.parse(
        {
          model: options.model ?? DEFAULT_PARSER_MODEL,
          max_tokens: options.maxTokens ?? 16000,
          system: systemParam(options),
          messages: [{ role: "user", content: options.content }],
          output_config: {
            format: betaZodOutputFormat(schema),
            effort: options.effort ?? "medium",
          },
          betas: [FALLBACK_BETA],
          fallbacks: "default",
        },
        { timeout: options.timeoutMs ?? 120_000, maxRetries: 3, signal: options.signal },
      );
      checkStop(message);
      const result = schema.safeParse(message.parsed_output);
      if (result.success) return { data: result.data, usage: usageOf(message) };
      lastError = new AiCallError(
        "invalid_output",
        `AI output failed validation: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
    } catch (error) {
      const aiError = toAiError(error);
      // Only malformed output is worth another try; the SDK already retried transport errors.
      if (aiError.kind !== "invalid_output") throw aiError;
      lastError = aiError;
    }
  }
  throw lastError ?? new AiCallError("invalid_output", "AI output failed validation");
}

/** Free-text call, streamed so long outputs (e.g. OCR of many pages) don't time out. */
export async function callText(options: AiCallOptions): Promise<{ text: string; usage: AiUsage }> {
  try {
    const stream = options.client.beta.messages.stream(
      {
        model: options.model ?? DEFAULT_PARSER_MODEL,
        max_tokens: options.maxTokens ?? 64000,
        system: systemParam(options),
        messages: [{ role: "user", content: options.content }],
        output_config: { effort: options.effort ?? "low" },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
      },
      { timeout: options.timeoutMs ?? 300_000, maxRetries: 3, signal: options.signal },
    );
    const message = await stream.finalMessage();
    checkStop(message);
    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return { text, usage: usageOf(message) };
  } catch (error) {
    throw toAiError(error);
  }
}
