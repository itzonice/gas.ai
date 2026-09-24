// Per-assignment confidence for the review screen: which items the student should
// double-check before committing. Derived only from flags, so it's reproducible.
import type { AssignmentFlags, ParsedAssignment } from "./result.ts";

export type Confidence = "high" | "medium" | "low";

export interface ConfidenceContext {
  /** Whether the term dates are known, so inferred years were checked against them. */
  termKnown: boolean;
}

/**
 * - low: no date (TBD), a computed date (week numbers, "next class"), or no category
 * - medium: generated from a recurring rule, or a year guessed without term dates
 * - high: printed date (year inference inside a known term is reliable)
 * An assumed 23:59 due time doesn't lower confidence; it's flagged separately.
 */
export function assignmentConfidence(flags: AssignmentFlags, ctx: ConfidenceContext): Confidence {
  if (flags.tbd || flags.inferred_date || flags.category_unmatched) return "low";
  if (flags.expanded_recurring || (flags.inferred_year && !ctx.termKnown)) return "medium";
  return "high";
}

export interface ConfidenceSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
  inferred_dates: number;
  inferred_years: number;
  expanded_recurring: number;
  tbd: number;
  default_times: number;
  categories_unmatched: number;
}

export function summarizeConfidence(assignments: readonly ParsedAssignment[]): ConfidenceSummary {
  const count = (pred: (a: ParsedAssignment) => boolean) => assignments.filter(pred).length;
  return {
    total: assignments.length,
    high: count((a) => a.confidence === "high"),
    medium: count((a) => a.confidence === "medium"),
    low: count((a) => a.confidence === "low"),
    inferred_dates: count((a) => a.flags.inferred_date),
    inferred_years: count((a) => a.flags.inferred_year),
    expanded_recurring: count((a) => a.flags.expanded_recurring),
    tbd: count((a) => a.flags.tbd),
    default_times: count((a) => a.flags.default_time),
    categories_unmatched: count((a) => a.flags.category_unmatched),
  };
}
