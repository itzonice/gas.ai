import {
  AiCallError,
  parseSyllabus,
  postProcess,
  type AiUsage,
} from "@studypulse/core/parser/index.ts";
import type { Logger } from "@studypulse/core/observability/index.ts";
import { localDate } from "@studypulse/core/time/index.ts";

import { anthropic } from "../anthropic.ts";
import { env } from "../env.ts";

import { Sentry } from "../sentry.ts";
import { adminClient } from "../supabase.ts";
import { ParseFailure } from "./errors.ts";
import { extractSyllabusText, type ExtractedText } from "./extract.ts";
import { fetchSyllabusUrl } from "./fetch-url.ts";

export { ParseFailure };

/** Message shown to the user when parsing fails for a reason we don't want to expose. */
const GENERIC_FAILURE = "We couldn't read this syllabus. Try another file or paste the text.";

type UploadRow = {
  id: string;
  user_id: string;
  source: "pdf" | "image" | "text" | "url";
  file_path: string | null;
  source_url: string | null;
  extracted_text: string | null;
  term_start_hint: string | null;
  term_end_hint: string | null;
};

/** User-facing messages for AI failures. */
function aiFailure(error: AiCallError): ParseFailure {
  switch (error.kind) {
    case "refusal":
      return new ParseFailure(
        "This syllabus couldn't be processed automatically. Try pasting the text.",
        "ai_refused",
      );
    case "truncated":
      return new ParseFailure(
        "This syllabus is too long to read in one go. Try uploading just the schedule pages.",
        "ai_truncated",
      );
    case "timeout":
      return new ParseFailure(
        "Reading this syllabus took too long. Please try again.",
        "ai_timeout",
      );
    case "invalid_output":
      return new ParseFailure(GENERIC_FAILURE, "ai_invalid_output");
    case "api":
    // A misconfigured model is logged with its name (see the caller); users just see
    // that reading is unavailable.
    case "model_not_found":
      return new ParseFailure(
        "Syllabus reading is temporarily unavailable. Please try again soon.",
        error.kind === "api" ? "ai_unavailable" : "ai_model_not_found",
      );
  }
}

/** Gets normalized text for an upload, extracting (and saving) it if needed. */
async function ensureText(
  upload: UploadRow,
  log: Logger,
): Promise<{ text: string; usage: AiUsage[] }> {
  // Pasted text (and uploads extracted on an earlier attempt) already have text.
  if (upload.extracted_text) return { text: upload.extracted_text, usage: [] };

  const db = adminClient();
  const { data: entitlements } = await db
    .rpc("parse_entitlements", { p_user_id: upload.user_id })
    .single();
  const options = { ocrAllowed: entitlements?.ocr_allowed ?? false };
  let extracted: ExtractedText;
  if (upload.source === "url" && upload.source_url) {
    extracted = await fetchSyllabusUrl(upload.source_url, log, options);
  } else if (upload.file_path) {
    const { data: blob, error } = await db.storage.from("syllabi").download(upload.file_path);
    if (error || !blob) {
      throw new ParseFailure("The uploaded file is missing. Upload it again.", "file_missing");
    }
    extracted = await extractSyllabusText(new Uint8Array(await blob.arrayBuffer()), log, options);
  } else {
    throw new ParseFailure(GENERIC_FAILURE, "missing_source");
  }
  if (extracted.text.replace(/--- Page \d+ ---/g, "").trim().length < 50) {
    throw new ParseFailure("We couldn't find any text in this file.", "no_text");
  }
  await db
    .from("syllabus_uploads")
    .update({
      extracted_text: extracted.text,
      extraction_method: extracted.method,
      page_count: extracted.pageCount,
    })
    .eq("id", upload.id);
  log.info("text extracted", {
    method: extracted.method,
    pages: extracted.pageCount,
    chars: extracted.text.length,
  });
  return { text: extracted.text, usage: extracted.usage ? [extracted.usage] : [] };
}

/**
 * Parses one upload end to end and records the outcome on its row. Never throws:
 * failures are stored as status = 'failed' with a user-safe error.
 */
export async function processSyllabusUpload(uploadId: string, log: Logger): Promise<void> {
  const db = adminClient();
  const plog = log.child({ upload_id: uploadId });

  // Claim the upload; only a pending upload can move to processing, so a retry
  // or duplicate trigger can't parse it twice.
  const { data: upload, error: claimError } = await db
    .from("syllabus_uploads")
    .update({ status: "processing", error: null })
    .eq("id", uploadId)
    .eq("status", "pending")
    .select(
      "id, user_id, source, file_path, source_url, extracted_text, term_start_hint, term_end_hint",
    )
    .maybeSingle();
  if (claimError) {
    plog.error("could not claim upload", { error: claimError.message });
    return;
  }
  if (!upload) {
    plog.info("upload already claimed or missing; skipping");
    return;
  }

  try {
    const { text, usage: extractionUsage } = await ensureText(upload, plog);

    const { data: profile } = await db
      .from("profiles")
      .select("timezone")
      .eq("id", upload.user_id)
      .single();
    const timezone = profile?.timezone ?? "UTC";

    let parsed;
    try {
      parsed = await parseSyllabus(
        anthropic(),
        text,
        {
          timezone,
          today: localDate(new Date(), timezone),
          termStart: upload.term_start_hint,
          termEnd: upload.term_end_hint,
        },
        env().PARSER_MODEL ? { model: env().PARSER_MODEL } : {},
      );
    } catch (error) {
      if (error instanceof AiCallError && error.kind === "model_not_found") {
        // Operators need the model name; users get the generic message.
        plog.error("parser model not found", { error: error.message });
      }
      throw error instanceof AiCallError ? aiFailure(error) : error;
    }

    const result = postProcess(parsed.output, {
      timezone,
      promptVersion: parsed.promptVersion,
      model: parsed.usage[0]?.model ?? env().PARSER_MODEL ?? "unknown",
      termStartHint: upload.term_start_hint,
      termEndHint: upload.term_end_hint,
    });

    const { error: saveError } = await db
      .from("syllabus_uploads")
      .update({
        status: "parsed",
        parse_result: result,
        prompt_version: parsed.promptVersion,
        model: parsed.usage[0]?.model ?? env().PARSER_MODEL ?? "unknown",
        parsed_at: new Date().toISOString(),
        ai_usage: [
          ...extractionUsage.map((u) => ({ step: "ocr", ...u })),
          ...parsed.usage.map((u) => ({ step: "parse", ...u })),
        ],
      })
      .eq("id", upload.id);
    if (saveError) throw saveError;
    plog.info("syllabus parsed", {
      assignments: result.assignments.length,
      dropped: result.dropped.length,
      categories: parsed.output.categories.length,
      chunks: parsed.chunks,
      output_tokens: parsed.usage.reduce((sum, u) => sum + u.outputTokens, 0),
    });
  } catch (error) {
    const message = error instanceof ParseFailure ? error.message : GENERIC_FAILURE;
    if (error instanceof ParseFailure) {
      plog.warn("parse failed", { code: error.code, reason: message });
    } else {
      plog.error("parse crashed", { error });
      Sentry.captureException(error, { tags: { upload_id: uploadId } });
    }
    await db
      .from("syllabus_uploads")
      .update({ status: "failed", error: message })
      .eq("id", uploadId);
  }
}
