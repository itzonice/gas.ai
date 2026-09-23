// Turns a stored syllabus file into normalized, page-marked text. PDFs use their
// text layer; scanned PDFs (thin or missing text layer) and photos go through OCR.
import { encodeBase64 } from "jsr:@std/encoding@^1/base64";
import {
  AiCallError,
  detectSyllabusFileType,
  extractPdfText,
  joinPages,
  needsOcr,
  ocrSyllabus,
} from "@studypulse/core/parser/index.ts";
import type { Logger } from "@studypulse/core/observability/index.ts";
import type { AiUsage } from "@studypulse/core/parser/index.ts";

import { anthropic } from "../anthropic.ts";
import { env } from "../env.ts";
import { ParseFailure } from "./errors.ts";

export interface ExtractedText {
  text: string;
  pageCount: number;
  method: "text_layer" | "ocr" | "url";
  /** Token usage when OCR was needed. */
  usage?: AiUsage;
}

const IMAGE_MEDIA_TYPES = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" } as const;

async function ocr(input: Parameters<typeof ocrSyllabus>[1], log: Logger): Promise<ExtractedText> {
  try {
    const model = env().PARSER_MODEL;
    const result = await ocrSyllabus(anthropic(), input, model ? { model } : {});
    log.info("ocr complete", { pages: result.pageCount, ...result.usage });
    return {
      text: result.text,
      pageCount: Math.max(1, result.pageCount),
      method: "ocr",
      usage: result.usage,
    };
  } catch (error) {
    if (error instanceof AiCallError && error.kind === "refusal") {
      throw new ParseFailure(
        "This file couldn't be processed. Try pasting the syllabus text instead.",
        "ocr_refused",
      );
    }
    throw error;
  }
}

export async function extractSyllabusText(bytes: Uint8Array, log: Logger): Promise<ExtractedText> {
  const type = detectSyllabusFileType(bytes.subarray(0, 1024));

  if (type === "pdf") {
    let pages: string[];
    try {
      ({ pages } = await extractPdfText(bytes));
    } catch (error) {
      log.warn("pdf text extraction failed; falling back to ocr", { error });
      return await ocr({ kind: "pdf", base64: encodeBase64(bytes) }, log);
    }
    if (needsOcr(pages)) {
      log.info("pdf text layer too thin; using ocr", { pages: pages.length });
      return await ocr({ kind: "pdf", base64: encodeBase64(bytes) }, log);
    }
    return { text: joinPages(pages), pageCount: pages.length, method: "text_layer" };
  }

  if (type === "png" || type === "jpeg" || type === "webp") {
    return await ocr(
      { kind: "image", base64: encodeBase64(bytes), mediaType: IMAGE_MEDIA_TYPES[type] },
      log,
    );
  }

  throw new ParseFailure(
    "This file type isn't supported. Upload a PDF, PNG, JPEG, or WebP.",
    "unsupported_file",
  );
}
