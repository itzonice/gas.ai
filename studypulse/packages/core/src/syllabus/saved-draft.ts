// Autosave for the syllabus review (launch audit L3). The review draft is kept on the
// device (browser storage on the web, AsyncStorage in the apps) as the student edits, so
// closing the tab or app doesn't lose their checks and fixes. Storage is untrusted: a
// saved draft is parsed with zod, tied to its upload, and dropped after two weeks.
import { z } from "zod";

import { letterScaleSchema } from "../grades/letters.ts";
import { ASSIGNMENT_KINDS } from "../parser/prompts/v1/schema.ts";
import { MEETING_KINDS, WEEKDAYS } from "../parser/prompts/v2/schema.ts";
import type { ReviewDraft } from "./review.ts";

export const SAVED_DRAFT_MAX_AGE_MS = 14 * 86_400_000;

export const savedDraftKey = (uploadId: string) => `studypulse.review-draft.${uploadId}`;

const text = (max: number) => z.string().max(max);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const reviewDraftSchema = z.object({
  course: z.object({
    name: text(300),
    code: text(100),
    instructor: text(300),
    term_start: z.union([date, z.literal("")]),
    term_end: z.union([date, z.literal("")]),
  }),
  categories: z
    .array(
      z.object({
        key: text(50),
        name: text(200),
        weight: z.number().nullable(),
        drop_lowest: z.number().int().nullable(),
      }),
    )
    .max(100),
  items: z
    .array(
      z.object({
        key: text(50),
        title: text(500),
        kind: z.enum(ASSIGNMENT_KINDS),
        category_name: text(200).nullable(),
        due_date: date.nullable(),
        due_time: z
          .string()
          .regex(/^\d{2}:\d{2}$/)
          .nullable(),
        points_possible: z.number().nullable(),
        confidence: z.enum(["low", "medium", "high"]),
        reasons: z.array(text(300)).max(20),
        source_quote: text(5000),
        checked: z.boolean(),
        excluded: z.boolean(),
      }),
    )
    .max(1000),
  letter_scale: letterScaleSchema.nullable(),
  meetings: z
    .array(
      z.object({
        weekday: z.enum(WEEKDAYS),
        start_time: z.string(),
        end_time: z.string(),
        kind: z.enum(MEETING_KINDS),
        location: text(200).nullable(),
      }),
    )
    .max(30),
  timezone: text(100),
});

const savedDraftSchema = z.object({
  v: z.literal(1),
  uploadId: z.string(),
  savedAt: z.number(),
  draft: reviewDraftSchema,
});

/** The JSON to store for this upload's draft. */
export function serializeDraft(uploadId: string, draft: ReviewDraft, now = Date.now()): string {
  return JSON.stringify({ v: 1, uploadId, savedAt: now, draft });
}

/** A saved draft for this upload, or null if missing, for another upload, stale, or invalid. */
export function parseSavedDraft(
  raw: string | null | undefined,
  uploadId: string,
  now = Date.now(),
): ReviewDraft | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = savedDraftSchema.safeParse(value);
  if (!parsed.success) return null;
  const { uploadId: savedFor, savedAt, draft } = parsed.data;
  if (savedFor !== uploadId || now - savedAt > SAVED_DRAFT_MAX_AGE_MS || savedAt > now + 60_000) {
    return null;
  }
  return draft;
}

/** Whether the student changed anything since the parse (for the unsaved-changes warning). */
export function draftChanged(original: ReviewDraft, current: ReviewDraft): boolean {
  return JSON.stringify(original) !== JSON.stringify(current);
}
