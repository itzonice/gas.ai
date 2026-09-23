import type { Logger } from "@studypulse/core/observability/index.ts";

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
};

/** Gets normalized text for an upload, extracting (and saving) it if needed. */
async function ensureText(upload: UploadRow, log: Logger): Promise<string> {
  // Pasted text (and uploads extracted on an earlier attempt) already have text.
  if (upload.extracted_text) return upload.extracted_text;

  const db = adminClient();
  let extracted: ExtractedText;
  if (upload.source === "url" && upload.source_url) {
    extracted = await fetchSyllabusUrl(upload.source_url, log);
  } else if (upload.file_path) {
    const { data: blob, error } = await db.storage.from("syllabi").download(upload.file_path);
    if (error || !blob) {
      throw new ParseFailure("The uploaded file is missing. Upload it again.", "file_missing");
    }
    extracted = await extractSyllabusText(new Uint8Array(await blob.arrayBuffer()), log);
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
  return extracted.text;
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
    .select("id, user_id, source, file_path, source_url, extracted_text")
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
    await ensureText(upload, plog);
    throw new ParseFailure("Syllabus parsing is not available yet.", "not_implemented");
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
