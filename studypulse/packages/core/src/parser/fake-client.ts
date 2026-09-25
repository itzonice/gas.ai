// Test double for the Anthropic client: only the beta.messages methods the parser uses.
import type Anthropic from "@anthropic-ai/sdk";

export type FakeReply =
  | {
      parsed?: unknown;
      text?: string;
      stop_reason?: Anthropic.Beta.BetaStopReason;
      /** The primary model declined and this fallback model answered (server-side fallback). */
      fallbackTo?: string;
    }
  | Error;

export function fakeClient(replies: FakeReply[]) {
  const calls: Record<string, unknown>[] = [];
  const next = (params: Record<string, unknown>) => {
    calls.push(params);
    const reply = replies.shift();
    if (!reply) throw new Error("fakeClient: no more replies");
    if (reply instanceof Error) throw reply;
    const fallback = reply.fallbackTo
      ? [
          {
            type: "fallback",
            from: { model: String(params.model) },
            to: { model: reply.fallbackTo },
          },
        ]
      : [];
    return {
      model: reply.fallbackTo ?? String(params.model),
      stop_reason: reply.stop_reason ?? "end_turn",
      parsed_output: reply.parsed ?? null,
      content: [
        ...fallback,
        ...(reply.text === undefined ? [] : [{ type: "text", text: reply.text }]),
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_read_input_tokens: 0,
        iterations: reply.fallbackTo
          ? [{ type: "message" }, { type: "fallback_message" }]
          : [{ type: "message" }],
      },
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
