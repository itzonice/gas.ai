// Review-screen model for a parsed syllabus: an editable draft built from the parse
// result, ordered so low-confidence items come first, and converted back into the
// commit_parsed_syllabus payload. Pure and browser-safe (no parser/PDF imports).
import { commitPayloadSchema, toCommitPayload, type CommitPayload } from "../parser/commit.ts";
import type { ParseResult, ParsedAssignment } from "../parser/result.ts";
import { zonedTimeToUtc } from "../time/index.ts";

export type AssignmentKind = ParsedAssignment["kind"];
export type Confidence = ParsedAssignment["confidence"];

export interface ReviewItem {
  /** Stable key for React lists and error mapping (index in the parse result). */
  key: string;
  title: string;
  kind: AssignmentKind;
  category_name: string | null;
  /** YYYY-MM-DD in the course timezone, or null for no date. */
  due_date: string | null;
  /** HH:MM (24h), or null to use 11:59 PM. */
  due_time: string | null;
  points_possible: number | null;
  confidence: Confidence;
  /** Why the parser wasn't sure, in plain words (empty for high confidence). */
  reasons: string[];
  /** The syllabus text the item came from. */
  source_quote: string;
  /** The student confirmed it (clears the "needs review" flag). */
  checked: boolean;
  /** Left out of the schedule. */
  excluded: boolean;
}

export interface ReviewCategory {
  key: string;
  name: string;
  weight: number | null;
  drop_lowest: number | null;
}

export interface ReviewDraft {
  course: {
    name: string;
    code: string;
    instructor: string;
    term_start: string;
    term_end: string;
  };
  categories: ReviewCategory[];
  items: ReviewItem[];
  letter_scale: CommitPayload["course"]["letter_scale"];
  timezone: string;
}

const CONFIDENCE_ORDER: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };

/** Plain-language reasons from the parser's flags. */
export function reviewReasons(a: Pick<ParsedAssignment, "flags" | "confidence">): string[] {
  const f = a.flags;
  const reasons: string[] = [];
  if (f.tbd) reasons.push("No due date in the syllabus");
  if (f.inferred_date) reasons.push("Date worked out from a week number or class day");
  if (f.category_unmatched) reasons.push("Category doesn't match the grading breakdown");
  if (f.expanded_recurring) reasons.push("One of a repeating series; check this date");
  if (f.inferred_year && a.confidence !== "high") reasons.push("Year was guessed");
  if (f.default_time) reasons.push("No time given; due 11:59 PM");
  return reasons;
}

/** The item still needs the student's attention. */
export function needsReview(item: Pick<ReviewItem, "confidence" | "checked" | "excluded">) {
  return !item.excluded && !item.checked && item.confidence !== "high";
}

/** Low-confidence first, then medium, then high; by date within each (undated last). */
export function sortForReview<T extends Pick<ReviewItem, "confidence" | "due_date" | "key">>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence] ||
      (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999") ||
      Number(a.key) - Number(b.key),
  );
}

export function toReviewDraft(result: ParseResult): ReviewDraft {
  return {
    course: {
      name: result.course.name,
      code: result.course.code ?? "",
      instructor: result.course.instructor ?? "",
      term_start: result.course.term_start ?? "",
      term_end: result.course.term_end ?? "",
    },
    categories: result.categories.map((c, i) => ({
      key: String(i),
      name: c.name,
      weight: c.weight,
      drop_lowest: c.drop_lowest,
    })),
    items: sortForReview(
      result.assignments.map((a, i) => ({
        key: String(i),
        title: a.title,
        kind: a.kind,
        category_name: a.category_name,
        due_date: a.due_date_local,
        due_time: a.flags.default_time ? null : a.due_time_local,
        points_possible: a.points_possible,
        confidence: a.confidence,
        reasons: reviewReasons(a),
        source_quote: a.source_quote,
        checked: false,
        excluded: false,
      })),
    ),
    letter_scale: toCommitPayload(result).course.letter_scale ?? null,
    timezone: result.timezone,
  };
}

export interface DraftIssue {
  path: string;
  message: string;
  itemKey?: string;
  categoryKey?: string;
}

/**
 * The commit payload for the draft (excluded items dropped, local dates converted to
 * UTC in the course timezone), or the issues to fix, tied back to items and categories.
 */
export function draftToPayload(
  draft: ReviewDraft,
): { ok: true; payload: CommitPayload } | { ok: false; issues: DraftIssue[] } {
  const included = draft.items.filter((i) => !i.excluded);
  const blank = (s: string) => (s.trim() === "" ? null : s.trim());
  const candidate = {
    course: {
      name: draft.course.name,
      code: blank(draft.course.code),
      instructor: blank(draft.course.instructor),
      term_start: blank(draft.course.term_start),
      term_end: blank(draft.course.term_end),
      letter_scale: draft.letter_scale,
    },
    categories: draft.categories.map((c) => ({
      name: c.name,
      weight: c.weight,
      drop_lowest: c.drop_lowest,
    })),
    assignments: included.map((i) => ({
      title: i.title,
      kind: i.kind,
      category_name: i.category_name,
      due_at: i.due_date
        ? zonedTimeToUtc(i.due_date, i.due_time ?? "23:59", draft.timezone).toISOString()
        : null,
      points_possible: i.points_possible,
    })),
  };
  const parsed = commitPayloadSchema.safeParse(candidate);
  if (parsed.success) return { ok: true, payload: parsed.data };
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => {
      const [section, index] = issue.path;
      const path = issue.path.join(".");
      if (section === "assignments" && typeof index === "number") {
        const item = included[index];
        return { path, message: issue.message, ...(item ? { itemKey: item.key } : {}) };
      }
      if (section === "categories" && typeof index === "number") {
        const cat = draft.categories[index];
        return { path, message: issue.message, ...(cat ? { categoryKey: cat.key } : {}) };
      }
      return { path, message: issue.message };
    }),
  };
}

/** Sum of category weights, for the "weights add up to N%" hint. */
export function totalWeight(categories: readonly ReviewCategory[]): number {
  return categories.reduce((sum, c) => sum + (c.weight ?? 0), 0);
}
