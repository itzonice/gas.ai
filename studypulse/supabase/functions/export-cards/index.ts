// GET /export-cards?course_id=<uuid>&format=anki|quizlet[&set_id=<uuid>]
// Downloads a course's flashcards (or one set's) as an Anki CSV or a Quizlet TSV. Reads
// through the caller's RLS, so users can only export their own courses.
import { exportCards } from "@studypulse/core/cards/index.ts";
import { z } from "zod";

import { createHandler } from "../_shared/handler.ts";
import { HttpError, parseQuery, requireMethod } from "../_shared/http.ts";
import { readAll } from "../_shared/paging.ts";
import { requireUser, userClient } from "../_shared/supabase.ts";

const querySchema = z.strictObject({
  course_id: z.uuid(),
  set_id: z.uuid().optional(),
  format: z.enum(["anki", "quizlet"]).default("anki"),
});

/** The most cards one export holds (ten full sets). */
const MAX_EXPORT_CARDS = 10_000;

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
    const query = parseQuery(req, querySchema);
    if (!query) throw new HttpError(400, "invalid_query", "Pass course_id and format=anki|quizlet");

    const db = userClient(req);
    const { data: course, error: courseError } = await db
      .from("courses")
      .select("name, code")
      .eq("id", query.course_id)
      .maybeSingle();
    if (courseError) throw courseError;
    if (!course) throw new HttpError(404, "course_not_found", "Course not found");

    let setTitle: string | null = null;
    if (query.set_id) {
      const { data: set, error: setError } = await db
        .from("card_sets")
        .select("title")
        .eq("id", query.set_id)
        .eq("course_id", query.course_id)
        .maybeSingle();
      if (setError) throw setError;
      if (!set) throw new HttpError(404, "set_not_found", "Card set not found");
      setTitle = set.title;
    }

    // Read in pages, so a big course exports every card (not just the first 100).
    const cards = await readAll((from, to) => {
      let page = db
        .from("flashcards")
        .select("front, back, tags")
        .eq("course_id", query.course_id)
        .order("set_id")
        .order("position")
        .order("created_at")
        .order("id")
        .range(from, to);
      if (query.set_id) page = page.eq("set_id", query.set_id);
      return page;
    }, MAX_EXPORT_CARDS);

    const courseTag = course.code ?? course.name;
    const deck = course.code ? `${course.code} ${course.name}` : course.name;
    const file = exportCards(
      cards.map((c) => ({ ...c, tags: [courseTag, ...c.tags] })),
      query.format,
      setTitle ? `StudyPulse::${deck}::${setTitle}` : `StudyPulse::${deck}`,
    );
    const name = fileBase(setTitle ? `${courseTag} ${setTitle}` : courseTag);
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${name}-${query.format}.${file.extension}"`,
        "Cache-Control": "no-store",
      },
    });
  }),
);
