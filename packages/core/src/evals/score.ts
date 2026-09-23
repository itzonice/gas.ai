// Scores a parser result against an eval case's expected output.
import { categorySimilarity } from "../parser/categories.ts";
import { normalizeTitle } from "../parser/dates.ts";
import type { ParseResult } from "../parser/result.ts";
import type { EvalCase, ExpectedAssignment } from "./case.ts";

export interface CaseScore {
  /** Expected items found / expected items. */
  recall: number;
  /** Predicted items that match an expected item / predicted items. */
  precision: number;
  /** Matched dated items with the right local date (TBD must stay TBD). */
  dateAccuracy: number;
  /** Matched items with a checked due time that got it right. */
  timeAccuracy: number | null;
  /** Matched items assigned to the right category (null = null). */
  categoryAccuracy: number;
  /** Expected categories found with the right weight (within 0.5). */
  weightAccuracy: number;
  /** Predicted weights total 100 within 1 point. */
  weightTotalOk: boolean;
  weightTotal: number;
  counts: { expected: number; predicted: number; matched: number };
  mismatches: string[];
}

const TITLE_MATCH_THRESHOLD = 0.6;

function tokens(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter(Boolean));
}

/** Title similarity: token overlap (Dice), with numbers required to agree. */
export function titleSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const numsA = [...ta]
    .filter((t) => /^\d+$/.test(t))
    .sort()
    .join(",");
  const numsB = [...tb]
    .filter((t) => /^\d+$/.test(t))
    .sort()
    .join(",");
  if (numsA !== numsB) return 0; // "Quiz 1" must not match "Quiz 2"
  const shared = [...ta].filter((t) => tb.has(t)).length;
  return (2 * shared) / (ta.size + tb.size);
}

interface Predicted {
  title: string;
  due_date: string | null;
  due_time: string | null;
  category: string | null;
}

/**
 * Greedy one-to-one matching of predicted to expected items by title similarity,
 * using the due date as a tie-breaker (so repeated titles like weekly items pair up
 * by date).
 */
export function matchAssignments(
  expected: readonly ExpectedAssignment[],
  predicted: readonly Predicted[],
) {
  const pairs: { e: number; p: number; score: number }[] = [];
  expected.forEach((e, ei) => {
    predicted.forEach((p, pi) => {
      const sim = titleSimilarity(e.title, p.title);
      if (sim >= TITLE_MATCH_THRESHOLD)
        pairs.push({ e: ei, p: pi, score: sim + (e.due_date === p.due_date ? 0.5 : 0) });
    });
  });
  pairs.sort((a, b) => b.score - a.score);
  const usedE = new Set<number>();
  const usedP = new Set<number>();
  const matches: [number, number][] = [];
  for (const { e, p } of pairs) {
    if (usedE.has(e) || usedP.has(p)) continue;
    usedE.add(e);
    usedP.add(p);
    matches.push([e, p]);
  }
  return matches;
}

const sameCategory = (a: string | null, b: string | null) =>
  a === null || b === null ? a === b : categorySimilarity(a, b) >= 0.8;

const ratio = (n: number, d: number) => (d === 0 ? 1 : n / d);

export function scoreCase(
  testCase: EvalCase,
  result: Pick<ParseResult, "assignments" | "categories">,
): CaseScore {
  const expected = testCase.expected.assignments;
  const predicted: Predicted[] = result.assignments.map((a) => ({
    title: a.title,
    due_date: a.due_date_local,
    due_time: a.flags.default_time ? null : a.due_time_local,
    category: a.category_name,
  }));
  const matches = matchAssignments(expected, predicted);
  const mismatches: string[] = [];

  let dateOk = 0;
  let timeChecked = 0;
  let timeOk = 0;
  let categoryOk = 0;
  for (const [ei, pi] of matches) {
    const e = expected[ei];
    const p = predicted[pi];
    if (!e || !p) continue;
    if (e.due_date === p.due_date) dateOk++;
    else
      mismatches.push(
        `date: "${e.title}" expected ${e.due_date ?? "TBD"}, got ${p.due_date ?? "TBD"}`,
      );
    if (e.due_time) {
      timeChecked++;
      if (e.due_time === p.due_time) timeOk++;
      else
        mismatches.push(`time: "${e.title}" expected ${e.due_time}, got ${p.due_time ?? "none"}`);
    }
    if (sameCategory(e.category, p.category)) categoryOk++;
    else
      mismatches.push(
        `category: "${e.title}" expected ${e.category ?? "none"}, got ${p.category ?? "none"}`,
      );
  }
  const matchedE = new Set(matches.map(([e]) => e));
  const matchedP = new Set(matches.map(([, p]) => p));
  expected.forEach((e, i) => {
    if (!matchedE.has(i)) mismatches.push(`missing: "${e.title}" (${e.due_date ?? "TBD"})`);
  });
  predicted.forEach((p, i) => {
    if (!matchedP.has(i)) mismatches.push(`extra: "${p.title}" (${p.due_date ?? "TBD"})`);
  });

  let weightOk = 0;
  for (const ec of testCase.expected.categories) {
    const pc = result.categories.find((c) => categorySimilarity(c.name, ec.name) >= 0.8);
    if (pc && pc.weight !== null && Math.abs(pc.weight - ec.weight) <= 0.5) weightOk++;
    else
      mismatches.push(
        `weight: "${ec.name}" expected ${String(ec.weight)}, got ${pc ? String(pc.weight) : "missing"}`,
      );
  }
  const weightTotal = result.categories.reduce((s, c) => s + (c.weight ?? 0), 0);

  return {
    recall: ratio(matches.length, expected.length),
    precision: ratio(matches.length, predicted.length),
    dateAccuracy: ratio(dateOk, matches.length),
    timeAccuracy: timeChecked ? timeOk / timeChecked : null,
    categoryAccuracy: ratio(categoryOk, matches.length),
    weightAccuracy: ratio(weightOk, testCase.expected.categories.length),
    weightTotalOk: Math.abs(weightTotal - 100) <= 1,
    weightTotal,
    counts: { expected: expected.length, predicted: predicted.length, matched: matches.length },
    mismatches,
  };
}

export interface EvalSummary {
  cases: number;
  recall: number;
  precision: number;
  dateAccuracy: number;
  timeAccuracy: number | null;
  categoryAccuracy: number;
  weightAccuracy: number;
  weightTotalOkRate: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Macro-averaged metrics (each case counts equally). */
export function summarize(scores: readonly CaseScore[]): EvalSummary {
  const times = scores.map((s) => s.timeAccuracy).filter((t): t is number => t !== null);
  return {
    cases: scores.length,
    recall: mean(scores.map((s) => s.recall)),
    precision: mean(scores.map((s) => s.precision)),
    dateAccuracy: mean(scores.map((s) => s.dateAccuracy)),
    timeAccuracy: times.length ? mean(times) : null,
    categoryAccuracy: mean(scores.map((s) => s.categoryAccuracy)),
    weightAccuracy: mean(scores.map((s) => s.weightAccuracy)),
    weightTotalOkRate: mean(scores.map((s) => (s.weightTotalOk ? 1 : 0))),
  };
}
