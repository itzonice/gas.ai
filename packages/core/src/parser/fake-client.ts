// Test double for the Anthropic client: only the beta.messages methods the parser uses.
import type Anthropic from "@anthropic-ai/sdk";

export type FakeReply =
  { parsed?: unknown; text?: string; stop_reason?: Anthropic.Beta.BetaStopReason } | Error;

export function fakeClient(replies: FakeReply[]) {
  const calls: Record<string, unknown>[] = [];
  const next = (params: Record<string, unknown>) => {
    calls.push(params);
    const reply = replies.shift();
    if (!reply) throw new Error("fakeClient: no more replies");
    if (reply instanceof Error) throw reply;
    return {
      model: String(params.model),
      stop_reason: reply.stop_reason ?? "end_turn",
      parsed_output: reply.parsed ?? null,
      content: reply.text === undefined ? [] : [{ type: "text", text: reply.text }],
      usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0 },
    };
  };
  const client = {
    beta: {
      messages: {
        parse: (params: Record<string, unknown>) => Promise.resolve().then(() => next(params)),
        stream: (params: Record<string, unknown>) => ({
          finalMessage: () => Promise.resolve().then(() => next(params)),
        }),
      },
    },
  };
  return { client: client as unknown as Anthropic, calls };
}
