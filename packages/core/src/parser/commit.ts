// Payload for the commit_parsed_syllabus RPC, built from a (reviewed) ParseResult.
// Mirrors the checks the SQL function makes, so the client gets field-level errors
// before the round trip. The database remains the authority.
import { z } from "zod";

import { ASSIGNMENT_KINDS } from "./prompts/v1/schema.ts";
import type { ParseResult } from "./result.ts";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const commitPayloadSchema = z
  .object({
    course: z.object({
      name: z.string().trim().min(1).max(200),
      code: z.string().trim().max(50).nullable().optional(),
      instructor: z.string().trim().max(200).nullable().optional(),
      term_start: isoDate.nullable().optional(),
      term_end: isoDate.nullable().optional(),
      target_grade: z.number().min(0).max(100).nullable().optional(),
      color: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/)
        .nullable()
        .optional(),
    }),
    categories: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(100),
          weight: z.number().min(0).max(100).nullable(),
        }),
      )
      .max(30),
    assignments: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(300),
          kind: z.enum(ASSIGNMENT_KINDS),
          category_name: z.string().nullable(),
          due_at: z.iso.datetime({ offset: true }).nullable(),
          points_possible: z.number().positive().nullable(),
          estimated_minutes: z.number().int().positive().max(10080).nullable().optional(),
        }),
      )
      .max(500),
  })
  .superRefine((payload, ctx) => {
    const names = payload.categories.map((c) => c.name.trim().toLowerCase());
    names.forEach((name, i) => {
      if (names.indexOf(name) !== i) {
        ctx.addIssue({
          code: "custom",
          path: ["categories", i, "name"],
          message: "Category names must be unique",
        });
      }
    });
    payload.assignments.forEach((a, i) => {
      if (a.category_name && !names.includes(a.category_name.trim().toLowerCase())) {
        ctx.addIssue({
          code: "custom",
          path: ["assignments", i, "category_name"],
          message: `"${a.category_name}" is not one of the categories`,
        });
      }
    });
    const { term_start, term_end } = payload.course;
    if (term_start && term_end && term_end < term_start) {
      ctx.addIssue({
        code: "custom",
        path: ["course", "term_end"],
        message: "Term end is before term start",
      });
    }
  });

export type CommitPayload = z.infer<typeof commitPayloadSchema>;

/** The payload the review screen starts from: the parse result minus review-only fields. */
export function toCommitPayload(result: ParseResult): CommitPayload {
  return {
    course: {
      name: result.course.name,
      code: result.course.code,
      instructor: result.course.instructor,
      term_start: result.course.term_start,
      term_end: result.course.term_end,
    },
    categories: result.categories.map((c) => ({ name: c.name, weight: c.weight })),
    assignments: result.assignments.map((a) => ({
      title: a.title,
      kind: a.kind,
      category_name: a.category_name,
      due_at: a.due_at,
      points_possible: a.points_possible,
    })),
  };
}
