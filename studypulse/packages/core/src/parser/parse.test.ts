import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { AiCallError } from "./ai.ts";
import { fakeClient } from "./fake-client.ts";
import { parseSyllabusText } from "./parse.ts";
import type { AiSyllabusV2 } from "./prompts/index.ts";

const ctx = {
  timezone: "America/Chicago",
  today: "2026-12-01",
  termStart: "2027-01-12",
  termEnd: "2027-05-08",
};

const good: AiSyllabusV2 = {
  course: {
    name: "Cell Biology",
    code: "BIO 201",
    instructor: "Dr. Okafor",
    term_start: null,
    term_end: null,
  },
  categories: [{ name: "Exams", weight: 100, drop_lowest: null }],
  assignments: [],
  grading_scale: [],
  warnings: [],
  meetings: [],
};

describe("parseSyllabusText", () => {
  it("sends the versioned prompt with structured output, caching, and fallbacks", async () => {
    const { client, calls } = fakeClient([{ parsed: good }]);
    const result = await parseSyllabusText(client, "--- Page 1 ---\nBIO 201", ctx);

    expect(result.output.course.code).toBe("BIO 201");
    expect(result.promptVersion).toBe("syllabus-v2");
    expect(result.usage).toMatchObject({ inputTokens: 100, outputTokens: 50 });

    const call = calls[0]!;
    expect(call.model).toBe("claude-opus-5");
    expect(call.fallbacks).toBe("default");
    expect(call.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(call.system).toEqual([
      expect.objectContaining({ cache_control: { type: "ephemeral" } }),
    ]);
    const outputConfig = call.output_config as { format: { type: string }; effort: string };
    expect(outputConfig.format.type).toBe("json_schema");
    expect(outputConfig.effort).toBe("medium");
    const content = (call.messages as { content: { text: string }[] }[])[0]!.content[0]!.text;
    expect(content).toContain("timezone: America/Chicago");
    expect(content).toContain("BIO 201\n</syllabus>");
  });

  it("retries once when the output fails validation, then succeeds", async () => {
    const bad = { ...good, categories: [{ name: "Exams", weight: 250, drop_lowest: null }] };
    const { client, calls } = fakeClient([{ parsed: bad }, { parsed: good }]);
    const result = await parseSyllabusText(client, "text", ctx);
    expect(result.output.categories[0]!.weight).toBe(100);
    expect(calls).toHaveLength(2);
  });

  it("gives up after two invalid outputs", async () => {
    const { client } = fakeClient([{ parsed: { nope: true } }, { parsed: null }]);
    await expect(parseSyllabusText(client, "text", ctx)).rejects.toMatchObject({
      kind: "invalid_output",
    });
  });

  it("does not retry refusals or truncation", async () => {
    const refused = fakeClient([{ stop_reason: "refusal" }]);
    await expect(parseSyllabusText(refused.client, "text", ctx)).rejects.toMatchObject({
      kind: "refusal",
    });
    expect(refused.calls).toHaveLength(1);

    const truncated = fakeClient([{ stop_reason: "max_tokens", parsed: good }]);
    await expect(parseSyllabusText(truncated.client, "text", ctx)).rejects.toMatchObject({
      kind: "truncated",
    });
  });

  it("maps SDK timeouts and API errors to AiCallError", async () => {
    const timeout = fakeClient([new Anthropic.APIConnectionTimeoutError()]);
    await expect(parseSyllabusText(timeout.client, "text", ctx)).rejects.toMatchObject({
      kind: "timeout",
    });

    const other = fakeClient([new Error("socket hang up")]);
    const error = await parseSyllabusText(other.client, "text", ctx).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiCallError);
    expect(error).toMatchObject({ kind: "api" });
  });

  it("uses PARSER_MODEL when it's set instead of the default", async () => {
    const { client, calls } = fakeClient([{ parsed: good }]);
    const result = await parseSyllabusText(client, "text", ctx, { model: "claude-sonnet-5" });
    expect(calls[0]!.model).toBe("claude-sonnet-5");
    expect(result.usage).toMatchObject({ model: "claude-sonnet-5", fallback: false });
  });

  it("accepts the fallback model's answer when the primary refuses, and records who answered", async () => {
    const { client, calls } = fakeClient([{ parsed: good, fallbackTo: "claude-opus-4-8" }]);
    const result = await parseSyllabusText(client, "text", ctx);
    expect(result.output.course.code).toBe("BIO 201");
    // One request: the API re-ran it on the fallback model server-side.
    expect(calls).toHaveLength(1);
    expect(result.usage).toMatchObject({ model: "claude-opus-4-8", fallback: true });
  });

  it("reports a refusal when the fallback model also declines", async () => {
    const { client } = fakeClient([{ stop_reason: "refusal", fallbackTo: "claude-opus-4-8" }]);
    await expect(parseSyllabusText(client, "text", ctx)).rejects.toMatchObject({
      kind: "refusal",
    });
  });

  it("fails with a clear error naming an unknown model, without retrying", async () => {
    const notFound = new Anthropic.NotFoundError(
      404,
      { type: "error", error: { type: "not_found_error", message: "model: claude-opus-55" } },
      "model: claude-opus-55",
      new Headers(),
    );
    const { client, calls } = fakeClient([notFound]);
    const error = await parseSyllabusText(client, "text", ctx, { model: "claude-opus-55" }).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ kind: "model_not_found" });
    expect((error as Error).message).toBe(
      'Unknown AI model "claude-opus-55". Check PARSER_MODEL / CARDS_MODEL (default: claude-opus-5).',
    );
    expect(calls).toHaveLength(1);
  });
});
