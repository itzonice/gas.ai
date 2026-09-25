// POST /generate-cards
// { "course_id": uuid, "notes": "...", "assignment_id"?: uuid, "max_cards"?: 1-20 }
// Turns the student's notes into atomic retrieval cards (one idea each, phrased as a
// question), saves them to flashcards so the Anki and Quizlet exports include them, and
// completes a "Make 5-20 cards" task when one is passed. Free: 5 a day; Pro: 50.
import {
  generateCards,
  MAX_CARD_COUNT,
  MAX_NOTES_CHARS,
  MIN_NOTES_CHARS,
} from "@studypulse/core/cards/generate.ts";
import { AiCallError } from "@studypulse/core/parser/ai.ts";
import { z } from "zod";

import { anthropicOrNull } from "../_shared/anthropic.ts";
import { env } from "../_shared/env.ts";
import { createHandler } from "../_shared/handler.ts";
import { HttpError, json, parseJsonBody, requireMethod } from "../_shared/http.ts";
import { adminClient, requireUser, userClient } from "../_shared/supabase.ts";

const bodySchema = z.object({
  course_id: z.uuid(),
  assignment_id: z.uuid().optional(),
  notes: z
    .string()
    .trim()
    .min(MIN_NOTES_CHARS, "Add a few more lines of notes first")
    .max(MAX_NOTES_CHARS, "Notes are too long; split them into parts"),
  max_cards: z.number().int().min(1).max(MAX_CARD_COUNT).optional(),
});

Deno.serve(
  createHandler("generate-cards", async (req, { log }) => {
    requireMethod(req, "POST");
    const user = await requireUser(req);
    const body = await parseJsonBody(req, bodySchema);
    const db = userClient(req);
    const admin = adminClient();

    // Ownership through RLS: the caller must be able to see the course (and task).
    const { data: course, error: courseError } = await db
      .from("courses")
      .select("id, name, code")
      .eq("id", body.course_id)
      .maybeSingle();
    if (courseError) throw courseError;
    if (!course) throw new HttpError(404, "course_not_found", "Course not found");

    let task: { id: string; source: string; status: string } | null = null;
    if (body.assignment_id) {
      const { data, error } = await db
        .from("assignments")
        .select("id, source, status")
        .eq("id", body.assignment_id)
        .eq("course_id", course.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "assignment_not_found", "Assignment not found");
      task = data;
    }

    const ai = anthropicOrNull();
    if (!ai)
      throw new HttpError(503, "ai_not_configured", "Card generation is unavailable right now.");

    // Log first: the insert trigger enforces the daily limit atomically.
    const { data: generation, error: insertError } = await admin
      .from("card_generations")
      .insert({
        user_id: user.id,
        course_id: course.id,
        assignment_id: task?.id ?? null,
        notes_chars: body.notes.length,
      })
      .select("id")
      .single();
    if (insertError) {
      if (insertError.code === "SPK01") {
        throw new HttpError(429, "card_limit_reached", insertError.message);
      }
      throw insertError;
    }

    let result;
    try {
      result = await generateCards(
        ai,
        {
          notes: body.notes,
          ...(body.max_cards ? { maxCards: body.max_cards } : {}),
          courseLabel: course.code ? `${course.code} ${course.name}` : course.name,
        },
        { ...(env().CARDS_MODEL ? { model: env().CARDS_MODEL } : {}) },
      );
    } catch (error) {
      const usageRecorded = error instanceof AiCallError && error.kind !== "api";
      await admin
        .from("card_generations")
        .update({
          status: "failed",
          error: error instanceof Error ? error.message.slice(0, 500) : "unknown error",
          // A model response that failed validation still cost money; count it.
          ...(usageRecorded ? { ai_usage: [{ step: "cards", failed: true }] } : {}),
        })
        .eq("id", generation.id);
      if (error instanceof AiCallError && error.kind === "refusal") {
        throw new HttpError(422, "notes_refused", "These notes can't be turned into cards.");
      }
      log.warn("card generation failed", { error });
      throw new HttpError(502, "generation_failed", "Couldn't make cards right now. Try again.");
    }

    const tags = ["notes", ...(course.code ? [course.code] : [])];
    let saved: { id: string; front: string; back: string; tags: string[] }[] = [];
    if (result.cards.length > 0) {
      const { data, error } = await db
        .from("flashcards")
        .insert(
          result.cards.map((c) => ({
            course_id: course.id,
            assignment_id: task?.id ?? null,
            front: c.front,
            back: c.back,
            tags: [...tags, ...c.tags].slice(0, 20),
          })),
        )
        .select("id, front, back, tags");
      if (error) throw error;
      saved = data;
    }

    // The post-class "Make 5-20 cards" task is done once cards exist for it.
    if (task && task.source === "study_system" && saved.length > 0 && task.status !== "done") {
      const { error } = await db.from("assignments").update({ status: "done" }).eq("id", task.id);
      if (error) throw error;
    }

    await admin
      .from("card_generations")
      .update({
        status: "done",
        card_count: saved.length,
        prompt_version: result.promptVersion,
        ai_usage: [{ step: "cards", ...result.usage }],
      })
      .eq("id", generation.id);

    log.info("cards generated", { cards: saved.length, course_id: course.id });
    return json({
      cards: saved,
      skipped_reason: result.skippedReason,
      task_completed: Boolean(task && task.source === "study_system" && saved.length > 0),
    });
  }),
);
