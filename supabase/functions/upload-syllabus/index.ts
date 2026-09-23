// POST /upload-syllabus
// Starts parsing a syllabus from one of three sources:
//   { "source": "file", "file_path": "{user_id}/{name}" }  file already in the syllabi bucket
//   { "source": "text", "text": "..." }                     pasted text
//   { "source": "url",  "url": "https://..." }              public web page or PDF link
// Creates a syllabus_uploads row and parses in the background. Returns 202 with the
// upload id; clients poll the row (or subscribe) for status.
import {
  assertSafeUrl,
  detectSyllabusFileType,
  isOwnedStoragePath,
  joinPages,
  SYLLABUS_MAX_BYTES,
  SYLLABUS_MIME_TYPES,
  UnsafeUrlError,
} from "@studypulse/core/parser/index.ts";
import type { Logger } from "@studypulse/core/observability/index.ts";
import { z } from "zod";

import { runInBackground } from "../_shared/background.ts";
import { createHandler } from "../_shared/handler.ts";
import { HttpError, json, parseJsonBody, requireMethod } from "../_shared/http.ts";
import { adminClient, requireUser, type AuthedUser } from "../_shared/supabase.ts";
import { processSyllabusUpload } from "../_shared/syllabus/pipeline.ts";

const BUCKET = "syllabi";
export const MIN_PASTED_CHARS = 200;
export const MAX_PASTED_CHARS = 200_000;

const bodySchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("file"),
    file_path: z.string().min(3).max(300),
    original_filename: z.string().trim().min(1).max(255).optional(),
  }),
  z.object({
    source: z.literal("text"),
    text: z
      .string()
      .trim()
      .min(MIN_PASTED_CHARS, "Paste the whole syllabus (at least a few paragraphs)")
      .max(MAX_PASTED_CHARS, "That's too long for one syllabus"),
  }),
  z.object({
    source: z.literal("url"),
    url: z.string().trim().max(2048),
  }),
]);

type Body = z.infer<typeof bodySchema>;
type Created = { id: string; status: string };

function start(upload: Created, log: Logger): Response {
  runInBackground(processSyllabusUpload(upload.id, log));
  return json({ upload_id: upload.id, status: upload.status }, { status: 202 });
}

async function fromFile(
  user: AuthedUser,
  body: Extract<Body, { source: "file" }>,
  log: Logger,
): Promise<Response> {
  const db = adminClient();

  // Ownership: the path must be a file directly inside the caller's folder.
  if (!isOwnedStoragePath(body.file_path, user.id)) {
    throw new HttpError(403, "forbidden", "That file does not belong to you");
  }

  // Idempotent: a retry for the same file returns the existing upload.
  const findLive = () =>
    db
      .from("syllabus_uploads")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("file_path", body.file_path)
      .neq("status", "failed")
      .maybeSingle();
  const { data: existing } = await findLive();
  if (existing) return json({ upload_id: existing.id, status: existing.status });

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
  // HEIC is recognized so we can give a useful message, but the OCR model can't read it.
  if (!fileType || fileType === "heic") {
    await db.storage.from(BUCKET).remove([body.file_path]);
    throw new HttpError(
      415,
      "unsupported_file_type",
      fileType === "heic"
        ? "HEIC photos aren't supported yet. Export the photo as JPEG and try again."
        : "Upload a PDF or a photo (PNG, JPEG, WebP)",
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
    })
    .select("id, status")
    .single();
  if (insertError) {
    // Lost a race with a concurrent retry for the same file: return that upload.
    if (insertError.code === "23505") {
      const { data: winner } = await findLive();
      if (winner) return json({ upload_id: winner.id, status: winner.status });
    }
    throw insertError;
  }

  log.info("syllabus upload created", {
    upload_id: upload.id,
    file_type: fileType,
    size_bytes: blob.size,
  });
  return start(upload, log);
}

async function fromText(
  user: AuthedUser,
  body: Extract<Body, { source: "text" }>,
  log: Logger,
): Promise<Response> {
  const text = joinPages([body.text]);
  const { data: upload, error } = await adminClient()
    .from("syllabus_uploads")
    .insert({
      user_id: user.id,
      source: "text",
      extracted_text: text,
      extraction_method: "pasted",
      page_count: 1,
    })
    .select("id, status")
    .single();
  if (error) throw error;
  log.info("syllabus text submitted", { upload_id: upload.id, chars: text.length });
  return start(upload, log);
}

async function fromUrl(
  user: AuthedUser,
  body: Extract<Body, { source: "url" }>,
  log: Logger,
): Promise<Response> {
  // Cheap checks up front so obviously bad links fail fast; DNS and redirect checks
  // happen when the page is fetched.
  let url: URL;
  try {
    url = assertSafeUrl(body.url);
  } catch (error) {
    if (error instanceof UnsafeUrlError) throw new HttpError(400, "invalid_url", error.message);
    throw error;
  }
  const { data: upload, error } = await adminClient()
    .from("syllabus_uploads")
    .insert({ user_id: user.id, source: "url", source_url: url.toString() })
    .select("id, status")
    .single();
  if (error) throw error;
  log.info("syllabus url submitted", { upload_id: upload.id, host: url.hostname });
  return start(upload, log);
}

Deno.serve(
  createHandler("upload-syllabus", async (req, { log }) => {
    requireMethod(req, "POST");
    const user = await requireUser(req);
    const body = await parseJsonBody(req, bodySchema);
    switch (body.source) {
      case "file":
        return await fromFile(user, body, log);
      case "text":
        return await fromText(user, body, log);
      case "url":
        return await fromUrl(user, body, log);
    }
  }),
);
