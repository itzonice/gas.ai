// Checks a typed answer against a card. Forgiving about things that aren't the point of
// the question (capitals, accents, punctuation, a leading "the", one small typo in a long
// word) and strict about things that are (numbers, short answers).
//
// A card's answer can list alternatives ("mitochondrion / mitochondria", "car; auto") and
// optional detail in brackets ("ATP (adenosine triphosphate)"): any alternative is right,
// and so is the answer with or without the bracketed part.

export type AnswerVerdict = "correct" | "close" | "wrong";

export interface AnswerCheck {
  verdict: AnswerVerdict;
  /** The accepted answer it matched, as written on the card (for "Correct spelling: …"). */
  matched: string | null;
}

const ARTICLES = /^(?:the|a|an)\s+/;

/** Lower-case, no accents, no punctuation, single spaces, no leading article. */
export function normalizeAnswer(text: string): string {
  const folded = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return folded.replace(ARTICLES, "") || folded;
}

/** Every way of writing the card's answer that counts as right, as written on the card. */
export function acceptedAnswers(expected: string): string[] {
  const whole = expected.trim();
  const out = new Set<string>();
  const add = (s: string) => {
    const t = s.trim();
    if (t) out.add(t);
  };
  const withBrackets = (s: string) => {
    add(s);
    const inside = [...s.matchAll(/\(([^()]+)\)/g)].map((m) => m[1] ?? "");
    if (inside.length) {
      add(s.replace(/\([^()]*\)/g, " "));
      for (const part of inside) add(part);
    }
  };
  withBrackets(whole);
  // Alternatives only split on separators with a clear meaning; a comma is usually part
  // of one answer ("Paris, France"), so it doesn't split.
  const parts = whole.split(/\s*(?:;|\s\/\s|\sor\s)\s*/i);
  if (parts.length > 1) for (const part of parts) withBrackets(part);
  return [...out];
}

/** Edits (insert, delete, replace, swap neighbours) to turn one string into the other. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let twoBack: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        (previous[j] ?? 0) + 1,
        (row[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (twoBack[j - 2] ?? 0) + 1);
      }
      row.push(best);
    }
    twoBack = previous;
    previous = row;
  }
  return previous[b.length] ?? 0;
}

const digitsOf = (s: string) => s.replace(/\D+/g, " ").trim();

/** How many typos a normalized answer of this length is allowed. */
export function typoAllowance(length: number): number {
  if (length < 5) return 0;
  return length < 10 ? 1 : 2;
}

export function checkAnswer(expected: string, given: string): AnswerCheck {
  const answer = normalizeAnswer(given);
  if (!answer) return { verdict: "wrong", matched: null };
  const accepted = acceptedAnswers(expected);
  for (const candidate of accepted) {
    if (normalizeAnswer(candidate) === answer) return { verdict: "correct", matched: candidate };
  }
  for (const candidate of accepted) {
    const target = normalizeAnswer(candidate);
    // Numbers are never "close": 1945 is not 1946.
    if (digitsOf(target) !== digitsOf(answer)) continue;
    const allowed = typoAllowance(target.length);
    if (allowed > 0 && editDistance(target, answer) <= allowed) {
      return { verdict: "close", matched: candidate };
    }
  }
  return { verdict: "wrong", matched: null };
}

/** Whether two answers would be graded as the same (used to pick distinct wrong options). */
export function sameAnswer(a: string, b: string): boolean {
  return normalizeAnswer(a) === normalizeAnswer(b);
}

/**
 * Whether an answer is short enough to ask the student to type it. Long definitions are
 * asked as multiple choice or as "show the answer, then say whether you had it".
 */
export function isTypeable(answer: string): boolean {
  const normalized = normalizeAnswer(answer);
  return normalized.length > 0 && normalized.length <= 40 && normalized.split(" ").length <= 5;
}
