// zod schemas for API inputs. The server validates again; these give fast, field-level
// errors in the client and keep web and mobile in agreement.
import { z } from "zod";

import { SYLLABUS_MAX_BYTES } from "../parser/file-type.ts";
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

/** A syllabus file picked on the device, before it goes to storage. */
export const SYLLABUS_UPLOAD_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
export const uploadSyllabusFileInputSchema = z.object({
  filename: z.string().trim().min(1).max(255),
  type: z.enum(SYLLABUS_UPLOAD_TYPES, {
    error: "Upload a PDF or a photo (PNG, JPEG, or WebP)",
  }),
  size: z
    .number()
    .int()
    .positive("The file is empty")
    .max(SYLLABUS_MAX_BYTES, "The file is larger than 20 MB"),
  term_start: isoDateSchema.optional(),
  term_end: isoDateSchema.optional(),
});
export type UploadSyllabusFileInput = z.input<typeof uploadSyllabusFileInputSchema>;

export const todayFeedInputSchema = z.object({ date: isoDateSchema.optional() }).default({});
export type TodayFeedInput = z.infer<typeof todayFeedInputSchema>;

/** Response of get_today_overview(): the Today screen's metrics, reviews, and next exam. */
export const todayOverviewSchema = z.object({
  timezone: z.string(),
  today: isoDateSchema,
  week_start: isoDateSchema,
  due_this_week: z.number().int(),
  focus_minutes_this_week: z.number().int(),
  courses_at_risk: z.array(
    z.object({ id: uuidSchema, code: z.string(), current: z.number(), target: z.number() }),
  ),
  reviews: z.array(
    z.object({
      id: uuidSchema,
      kind: z.enum(["review", "exam_prep"]),
      status: z.enum(["planned", "done", "missed"]),
      starts_at: z.string(),
      ends_at: z.string(),
      minutes: z.number().int(),
      course_id: uuidSchema,
      assignment_id: uuidSchema.nullable(),
      title: z.string(),
    }),
  ),
  next_exam: z
    .object({
      id: uuidSchema,
      title: z.string(),
      course_id: uuidSchema,
      due_at: z.string(),
      days_until: z.number().int(),
    })
    .nullable(),
  courses: z.array(
    z.object({ id: uuidSchema, code: z.string(), name: z.string(), color: z.string().nullable() }),
  ),
});
export type TodayOverview = z.infer<typeof todayOverviewSchema>;

export const blockStatusInputSchema = z.object({
  id: uuidSchema,
  status: z.enum(["planned", "done", "missed"]),
});
export type BlockStatusInput = z.infer<typeof blockStatusInputSchema>;

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

export const registerPushTokenInputSchema = z
  .object({
    provider: z.enum(["expo", "web_push"]),
    token: z.string().min(1).max(2048),
    platform: z.enum(["ios", "android", "web"]),
    deviceId: z.string().max(200).optional(),
    appVersion: z.string().max(50).optional(),
    webPushKeys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }).optional(),
  })
  .refine(
    (t) => t.provider !== "expo" || /^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$/.test(t.token),
    {
      message: "Not an Expo push token",
      path: ["token"],
    },
  )
  .refine(
    (t) =>
      t.provider !== "web_push" || (t.webPushKeys !== undefined && t.token.startsWith("https://")),
    {
      message: "Web push needs the subscription endpoint and keys",
      path: ["webPushKeys"],
    },
  );
