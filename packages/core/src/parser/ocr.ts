// OCR fallback for scanned PDFs and photos of syllabi: Claude reads the page images
// directly and transcribes them with our page markers.
import type Anthropic from "@anthropic-ai/sdk";

import { callText, type AiUsage, type Effort } from "./ai.ts";
import { joinPages, splitPages } from "./text.ts";

export const OCR_SYSTEM_PROMPT = `You transcribe course syllabi into plain text for a parser.

Transcribe every piece of text in the document exactly as written, in reading order. Do not summarize, translate, correct, or add anything. Keep dates, times, percentages, and point values exactly as printed.

Format:
- Start each page with a line "--- Page N ---" (N is the page number, starting at 1), then that page's text.
- Render tables one row per line with cells separated by " | ".
- Render lists one item per line.
- If a part of a page is illegible, write [illegible] in its place.

Output only the transcription.`;

export type OcrInput =
  | { kind: "pdf"; base64: string }
  | { kind: "image"; base64: string; mediaType: "image/png" | "image/jpeg" | "image/webp" };

export async function ocrSyllabus(
  client: Anthropic,
  input: OcrInput,
  options: { model?: string; effort?: Effort; signal?: AbortSignal } = {},
): Promise<{ text: string; pageCount: number; usage: AiUsage }> {
  const source: Anthropic.Beta.BetaContentBlockParam =
    input.kind === "pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: input.base64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: input.mediaType, data: input.base64 },
        };

  const { text, usage } = await callText({
    client,
    ...(options.model ? { model: options.model } : {}),
    effort: options.effort ?? "low",
    system: OCR_SYSTEM_PROMPT,
    content: [source, { type: "text", text: "Transcribe this syllabus." }],
    ...(options.signal ? { signal: options.signal } : {}),
  });

  // Re-normalize so OCR output looks exactly like text-layer output.
  const pages = splitPages(text).map((p) => p.text);
  return { text: joinPages(pages), pageCount: pages.length, usage };
}
