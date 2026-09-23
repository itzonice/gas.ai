// zod schemas for API inputs. The server validates again; these give fast, field-level
// errors in the client and keep web and mobile in agreement.
import { z } from "zod";

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
