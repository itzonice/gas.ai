// zod schemas for API inputs. The server validates again; these give fast, field-level
// errors in the client and keep web and mobile in agreement.
import { z } from "zod";

import { ASSIGNMENT_KINDS } from "../parser/prompts/v1/schema.ts";

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const uuidSchema = z.uuid();

const termHints = { term_start: isoDateSchema.optional(), term_end: isoDateSchema.optional() };

export const uploadSyllabusInputSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("file"),
    file_path: z.string().min(3).max(300),
    original_filename: z.string().trim().min(1).max(255).optional(),
    ...termHints,
  }),
  z.object({
    source: z.literal("text"),
    text: z
      .string()
      .trim()
      .min(200, "Paste the whole syllabus (at least a few paragraphs)")
      .max(200_000),
    ...termHints,
  }),
  z.object({
    source: z.literal("url"),
    url: z.url({ protocol: /^https?$/ }).max(2048),
    ...termHints,
  }),
]);
export type UploadSyllabusInput = z.infer<typeof uploadSyllabusInputSchema>;

export const todayFeedInputSchema = z.object({ date: isoDateSchema.optional() }).default({});
export type TodayFeedInput = z.infer<typeof todayFeedInputSchema>;

export const exportCardsInputSchema = z.object({
  courseId: uuidSchema,
  format: z.enum(["anki", "quizlet"]).default("anki"),
});
export type ExportCardsInput = z.input<typeof exportCardsInputSchema>;

export const startSessionInputSchema = z.object({
  /** Client-generated id; reuse it when retrying so the start is idempotent. */
  id: uuidSchema,
  courseId: uuidSchema,
  assignmentId: uuidSchema.optional(),
  /** When the timer actually started (offline starts); defaults to now on the server. */
  startedAt: z.iso.datetime({ offset: true }).optional(),
});
export type StartSessionInput = z.input<typeof startSessionInputSchema>;

export const stopSessionInputSchema = z.object({
  id: uuidSchema,
  endedAt: z.iso.datetime({ offset: true }).optional(),
});
export type StopSessionInput = z.input<typeof stopSessionInputSchema>;

const assignmentFields = {
  title: z.string().trim().min(1).max(300),
  kind: z.enum(ASSIGNMENT_KINDS),
  categoryId: uuidSchema.nullable(),
  description: z.string().max(10_000).nullable(),
  /** UTC instant (ISO 8601 with offset). */
  dueAt: z.iso.datetime({ offset: true }).nullable(),
  pointsPossible: z.number().positive().max(100_000).nullable(),
  pointsEarned: z.number().min(0).max(200_000).nullable(),
  estimatedMinutes: z.number().int().positive().max(10_080).nullable(),
  status: z.enum(["todo", "in_progress", "done", "skipped"]),
};

export const createAssignmentInputSchema = z
  .object({ courseId: uuidSchema, ...assignmentFields })
  .partial({
    kind: true,
    categoryId: true,
    description: true,
    dueAt: true,
    pointsPossible: true,
    pointsEarned: true,
    estimatedMinutes: true,
    status: true,
  })
  .refine((a) => a.pointsEarned == null || a.pointsPossible != null, {
    message: "Add points possible before entering a score",
    path: ["pointsEarned"],
  });
export type CreateAssignmentInput = z.input<typeof createAssignmentInputSchema>;

export const updateAssignmentInputSchema = z
  .object({ id: uuidSchema, ...assignmentFields })
  .partial()
  .required({ id: true })
  .refine((a) => Object.keys(a).length > 1, { message: "Nothing to update" });
export type UpdateAssignmentInput = z.input<typeof updateAssignmentInputSchema>;
