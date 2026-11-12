// Paste-to-import for cards: one card per line, the term and its definition separated by
// a tab (what Quizlet, Anki, and spreadsheets export), " - ", " :: ", " = ", or a comma.
// The separator is detected from the text unless one is chosen. Pure.

export type TermSeparator = "tab" | "colons" | "dash" | "equals" | "comma";
export type CardSeparator = "newline" | "semicolon";

export const TERM_SEPARATOR_LABELS: Record<TermSeparator, string> = {
  tab: "Tab",
  colons: "Two colons ( :: )",
  dash: "Dash ( - )",
  equals: "Equals sign ( = )",
  comma: "Comma",
};

const SPLITTERS: Record<TermSeparator, RegExp> = {
  tab: /\t+/,
  colons: /\s*::\s*/,
  dash: /\s+[-–—]\s+/,
  equals: /\s+=\s+/,
  comma: /\s*,\s*/,
};

/** Checked in this order: the least likely to appear by accident inside a term first. */
const DETECT_ORDER: readonly TermSeparator[] = ["tab", "colons", "dash", "equals", "comma"];

export const MAX_IMPORT_CARDS = 500;
export const MAX_FRONT_CHARS = 2000;
export const MAX_BACK_CHARS = 5000;

export interface ImportedCard {
  front: string;
  back: string;
}

export interface SkippedLine {
  /** 1-based line number in the pasted text. */
  line: number;
  text: string;
  reason: "no_separator" | "empty_side" | "too_long" | "duplicate" | "over_limit";
}

export const SKIP_REASONS: Record<SkippedLine["reason"], string> = {
  no_separator: "No separator between the term and the definition",
  empty_side: "The term or the definition is empty",
  too_long: "Too long for a card",
  duplicate: "Same as an earlier line",
  over_limit: `Over the limit of ${String(MAX_IMPORT_CARDS)} cards per import`,
};

export interface ImportResult {
  cards: ImportedCard[];
  skipped: SkippedLine[];
  /** The separator that was used (detected or chosen). */
  separator: TermSeparator;
}

const splitEntries = (text: string, cardSeparator: CardSeparator) =>
  text.replace(/\r\n?/g, "\n").split(cardSeparator === "semicolon" ? /;\s*\n?|\n/ : /\n/);

/** The separator most lines contain; ties go to the earlier one in DETECT_ORDER. */
export function detectSeparator(text: string): TermSeparator {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim());
  let best: TermSeparator = "tab";
  let bestCount = 0;
  for (const separator of DETECT_ORDER) {
    const count = lines.filter((l) => SPLITTERS[separator].test(l.trim())).length;
    if (count > bestCount) {
      best = separator;
      bestCount = count;
    }
  }
  return best;
}

export function parseCardImport(
  text: string,
  options: { separator?: TermSeparator | "auto"; cardSeparator?: CardSeparator } = {},
): ImportResult {
  const separator =
    !options.separator || options.separator === "auto" ? detectSeparator(text) : options.separator;
  const splitter = SPLITTERS[separator];
  const cards: ImportedCard[] = [];
  const skipped: SkippedLine[] = [];
  const seen = new Set<string>();

  splitEntries(text, options.cardSeparator ?? "newline").forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const skip = (reason: SkippedLine["reason"]) => {
      skipped.push({ line: index + 1, text: line.slice(0, 200), reason });
    };
    const at = splitter.exec(line);
    if (!at) {
      skip("no_separator");
      return;
    }
    // Only the first separator splits: the definition may contain more of them.
    const front = line.slice(0, at.index).trim();
    const back = line.slice(at.index + at[0].length).trim();
    if (!front || !back) {
      skip("empty_side");
      return;
    }
    if (front.length > MAX_FRONT_CHARS || back.length > MAX_BACK_CHARS) {
      skip("too_long");
      return;
    }
    const key = `${front.toLowerCase()}\u0000${back.toLowerCase()}`;
    if (seen.has(key)) {
      skip("duplicate");
      return;
    }
    if (cards.length >= MAX_IMPORT_CARDS) {
      skip("over_limit");
      return;
    }
    seen.add(key);
    cards.push({ front, back });
  });

  return { cards, skipped, separator };
}
