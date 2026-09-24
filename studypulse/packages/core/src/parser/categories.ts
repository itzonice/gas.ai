// Matches each assignment's category_name to the extracted grade categories. The
// model usually copies names exactly, but syllabi say "Quiz" in the schedule and
// "Quizzes" in the grading table, "HW" vs "Homework", and so on.
import type { ParseWarning, ParsedCategory } from "./result.ts";

const FILLER = new Set([
  "the",
  "and",
  "of",
  "a",
  "an",
  "grade",
  "grades",
  "total",
  "overall",
  "course",
]);
const ABBREVIATIONS: Record<string, string> = {
  hw: "homework",
  hws: "homework",
  pset: "problem set",
  psets: "problem set",
  ps: "problem set",
  lab: "lab",
  exam: "exam",
  mt: "midterm",
  mid: "midterm",
  prj: "project",
  proj: "project",
  pres: "presentation",
  part: "participation",
  disc: "discussion",
  ec: "extra credit",
};

function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("zzes")) return word.slice(0, -3); // quizzes -> quiz
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`; // activities -> activity
  if (/(ss|x|ch|sh)es$/.test(word)) return word.slice(0, -2); // classes, boxes
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Normalized token list: lowercase, no punctuation, singular, abbreviations expanded. */
export function categoryTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .flatMap((w) => (ABBREVIATIONS[w] ?? singular(w)).split(" "))
    .map(singular)
    .filter((w) => !FILLER.has(w));
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j] ?? 0;
      prev[j] = Math.min(up + 1, (prev[j - 1] ?? 0) + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length] ?? 0;
}

/** Similarity from 0 to 1 between two category names. */
export function categorySimilarity(a: string, b: string): number {
  const ta = categoryTokens(a);
  const tb = categoryTokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const ja = ta.join(" ");
  const jb = tb.join(" ");
  if (ja === jb) return 1;
  // "Homework" vs "Homework Assignments": one name's words all appear in the other.
  const [small, large] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (small.every((w) => large.includes(w))) return 0.9;
  return 1 - levenshtein(ja, jb) / Math.max(ja.length, jb.length);
}

export const CATEGORY_MATCH_THRESHOLD = 0.8;

export type CategoryMatch =
  | { kind: "exact" | "fuzzy"; name: string; score: number }
  | { kind: "none" | "ambiguous"; name: null; score: number };

/** Finds the category a name refers to. Ties between two different categories don't match. */
export function matchCategory(
  name: string | null,
  categories: readonly ParsedCategory[],
): CategoryMatch {
  if (!name?.trim()) return { kind: "none", name: null, score: 0 };
  const exact = categories.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (exact) return { kind: "exact", name: exact.name, score: 1 };

  const scored = categories
    .map((c) => ({ name: c.name, score: categorySimilarity(name, c.name) }))
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (!best || best.score < CATEGORY_MATCH_THRESHOLD)
    return { kind: "none", name: null, score: best?.score ?? 0 };
  if (second && best.score - second.score < 0.05)
    return { kind: "ambiguous", name: null, score: best.score };
  return { kind: "fuzzy", name: best.name, score: best.score };
}

/** Allowed distance from 100 before warning (rounding in syllabi like 33.3 x 3). */
export const WEIGHT_TOLERANCE = 1;

export function weightWarnings(categories: readonly ParsedCategory[]): ParseWarning[] {
  if (categories.length === 0) {
    return [
      {
        code: "no_categories",
        message: "No grade categories were found. Add them to track your grade.",
      },
    ];
  }
  const warnings: ParseWarning[] = [];
  const missing = categories.filter((c) => c.weight === null);
  if (missing.length > 0) {
    warnings.push({
      code: "weights_missing",
      message: `No weight was found for ${missing.map((c) => `"${c.name}"`).join(", ")}.`,
    });
  }
  const total = categories.reduce((sum, c) => sum + (c.weight ?? 0), 0);
  if (missing.length === 0 && Math.abs(total - 100) > WEIGHT_TOLERANCE) {
    const rounded = Math.round(total * 10) / 10;
    warnings.push({
      code: "weights_not_100",
      message: `Category weights add up to ${String(rounded)}%, not 100%. Check the grading section.`,
    });
  }
  return warnings;
}
