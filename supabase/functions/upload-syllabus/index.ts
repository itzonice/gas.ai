// POST /upload-syllabus
// Registers a syllabus file the client already uploaded to storage at
// `syllabi/{user_id}/{name}`, verifies it, creates a syllabus_uploads row, and starts
// parsing in the background. Returns 202 with the upload id; clients poll the row
// (or subscribe) for status.
import {
  detectSyllabusFileType,
  isOwnedStoragePath,
  SYLLABUS_MAX_BYTES,
  SYLLABUS_MIME_TYPES,
} from "@studypulse/core/parser/index.ts";
import { z } from "zod";

import { runInBackground } from "../_shared/background.ts";
import { createHandler } from "../_shared/handler.ts";
import { HttpError, json, parseJsonBody, requireMethod } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";
import { processSyllabusUpload } from "../_shared/syllabus/pipeline.ts";

const BUCKET = "syllabi";

const bodySchema = z.object({
  file_path: z.string().min(3).max(300),
  original_filename: z.string().trim().min(1).max(255).optional(),
});

Deno.serve(
  createHandler("upload-syllabus", async (req, { log }) => {
    requireMethod(req, "POST");
    const user = await requireUser(req);
    const body = await parseJsonBody(req, bodySchema);
    const db = adminClient();

    // Ownership: the path must be a file directly inside the caller's folder.
    if (!isOwnedStoragePath(body.file_path, user.id)) {
      throw new HttpError(403, "forbidden", "That file does not belong to you");
    }

    // Idempotent: a retry for the same file returns the existing upload.
    const { data: existing } = await db
      .from("syllabus_uploads")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("file_path", body.file_path)
      .neq("status", "failed")
      .maybeSingle();
    if (existing) return json({ upload_id: existing.id, status: existing.status }, { status: 200 });

    const { data: blob, error: downloadError } = await db.storage
      .from(BUCKET)
      .download(body.file_path);
    if (downloadError || !blob) throw new HttpError(404, "file_not_found", "Upload the file first");

    // Size and type are checked on the stored bytes, not on client-declared metadata.
    if (blob.size === 0 || blob.size > SYLLABUS_MAX_BYTES) {
      await db.storage.from(BUCKET).remove([body.file_path]);
      throw new HttpError(413, "file_too_large", "Syllabus files must be 20 MB or smaller");
    }
    const head = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
    const fileType = detectSyllabusFileType(head);
    if (!fileType) {
      await db.storage.from(BUCKET).remove([body.file_path]);
      throw new HttpError(
        415,
        "unsupported_file_type",
        "Upload a PDF or a photo (PNG, JPEG, HEIC, WebP)",
      );
    }

    const { data: upload, error: insertError } = await db
      .from("syllabus_uploads")
      .insert({
        user_id: user.id,
        source: fileType === "pdf" ? "pdf" : "image",
        file_path: body.file_path,
        original_filename: body.original_filename ?? body.file_path.split("/")[1] ?? null,
        mime_type: SYLLABUS_MIME_TYPES[fileType],
        size_bytes: blob.size,
        status: "pending",
      })
      .select("id, status")
      .single();
    if (insertError) {
      // Lost a race with a concurrent retry for the same file: return that upload.
      if (insertError.code === "23505") {
        const { data: winner } = await db
          .from("syllabus_uploads")
          .select("id, status")
          .eq("file_path", body.file_path)
          .neq("status", "failed")
          .single();
        if (winner) return json({ upload_id: winner.id, status: winner.status }, { status: 200 });
      }
      throw insertError;
    }

    log.info("syllabus upload created", {
      upload_id: upload.id,
      file_type: fileType,
      size_bytes: blob.size,
    });
    runInBackground(processSyllabusUpload(upload.id, log));

    return json({ upload_id: upload.id, status: upload.status }, { status: 202 });
  }),
);
