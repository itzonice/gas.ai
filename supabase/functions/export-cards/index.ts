// GET /export-cards?course_id=<uuid>&format=anki|quizlet
// Downloads a course's flashcards as an Anki CSV or a Quizlet TSV. Reads through the
// caller's RLS, so users can only export their own courses.
import { exportCards } from "@studypulse/core/cards/index.ts";
import { z } from "zod";

import { createHandler } from "../_shared/handler.ts";
import { HttpError, requireMethod } from "../_shared/http.ts";
import { requireUser, userClient } from "../_shared/supabase.ts";

const querySchema = z.object({
  course_id: z.uuid(),
  format: z.enum(["anki", "quizlet"]).default("anki"),
});

/** A filesystem-safe file name from the course code or name. */
function fileBase(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "flashcards"
  );
}

Deno.serve(
  createHandler("export-cards", async (req) => {
    requireMethod(req, "GET");
    await requireUser(req);
    const params = Object.fromEntries(new URL(req.url).searchParams);
    const query = querySchema.safeParse(params);
    if (!query.success)
      throw new HttpError(400, "invalid_query", "Pass course_id and format=anki|quizlet");

    const db = userClient(req);
    const { data: course, error: courseError } = await db
      .from("courses")
      .select("name, code")
      .eq("id", query.data.course_id)
      .maybeSingle();
    if (courseError) throw courseError;
    if (!course) throw new HttpError(404, "course_not_found", "Course not found");

    const { data: cards, error } = await db
      .from("flashcards")
      .select("front, back, tags")
      .eq("course_id", query.data.course_id)
      .order("created_at");
    if (error) throw error;

    const courseTag = course.code ?? course.name;
    const deck = course.code ? `${course.code} ${course.name}` : course.name;
    const file = exportCards(
      (cards ?? []).map((c) => ({ ...c, tags: [courseTag, ...c.tags] })),
      query.data.format,
      `StudyPulse::${deck}`,
    );
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${fileBase(courseTag)}-${query.data.format}.${file.extension}"`,
        "Cache-Control": "no-store",
      },
    });
  }),
);
