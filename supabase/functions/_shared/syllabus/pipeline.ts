import type { Logger } from "@studypulse/core/observability/index.ts";

import { Sentry } from "../sentry.ts";
import { adminClient } from "../supabase.ts";

/** Message shown to the user when parsing fails for a reason we don't want to expose. */
const GENERIC_FAILURE = "We couldn't read this syllabus. Try another file or paste the text.";

/** A failure whose message is safe to show the user. */
export class ParseFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseFailure";
  }
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
    .select("*")
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
    throw new ParseFailure("Syllabus parsing is not available yet.");
  } catch (error) {
    const message = error instanceof ParseFailure ? error.message : GENERIC_FAILURE;
    if (!(error instanceof ParseFailure)) {
      plog.error("parse crashed", { error });
      Sentry.captureException(error, { tags: { upload_id: uploadId } });
    } else {
      plog.warn("parse failed", { reason: message });
    }
    await db
      .from("syllabus_uploads")
      .update({ status: "failed", error: message })
      .eq("id", uploadId);
  }
}
