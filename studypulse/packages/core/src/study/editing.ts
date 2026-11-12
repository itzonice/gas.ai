// Text edits for the note editor's toolbar, as pure functions on (text, selection), so
// web and mobile format the same way and the behavior is testable. Each returns the new
// text and where the selection should be afterwards.

export interface Selection {
  text: string;
  /** Selection start and end, as string offsets (start <= end). */
  start: number;
  end: number;
}

const clamp = (n: number, max: number) => Math.min(Math.max(0, Math.trunc(n)), max);

function normalize(s: Selection): Selection {
  const start = clamp(Math.min(s.start, s.end), s.text.length);
  const end = clamp(Math.max(s.start, s.end), s.text.length);
  return { text: s.text, start, end };
}

/**
 * Wraps the selection in a mark (`**` for bold). With nothing selected it inserts the
 * placeholder, selected, so typing replaces it. Selecting text that's already wrapped
 * removes the marks.
 */
export function wrapSelection(input: Selection, mark: string, placeholder: string): Selection {
  const { text, start, end } = normalize(input);
  const selected = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);
  if (before.endsWith(mark) && after.startsWith(mark) && selected.length > 0) {
    return {
      text: before.slice(0, -mark.length) + selected + after.slice(mark.length),
      start: start - mark.length,
      end: end - mark.length,
    };
  }
  const inner = selected || placeholder;
  return {
    text: before + mark + inner + mark + after,
    start: start + mark.length,
    end: start + mark.length + inner.length,
  };
}

/** Where the lines touched by the selection start and end. */
function lineBounds(text: string, start: number, end: number): [number, number] {
  const from = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  // A selection that ends right after a newline doesn't include the next line.
  const last = end > start && text[end - 1] === "\n" ? end - 1 : end;
  const nl = text.indexOf("\n", last);
  return [start === 0 ? 0 : from, nl === -1 ? text.length : nl];
}

/**
 * Puts a prefix (`- `, `> `, `# `) at the start of every selected line; if they all have
 * it already, takes it off. Headings replace any other heading level.
 */
export function prefixLines(input: Selection, prefix: string): Selection {
  const { text, start, end } = normalize(input);
  const [from, to] = lineBounds(text, start, end);
  const lines = text.slice(from, to).split("\n");
  const isHeading = /^#{1,3} $/.test(prefix);
  const stripped = (line: string) => (isHeading ? line.replace(/^#{1,3}\s+/, "") : line);
  const allHave = lines.every((l) => l.startsWith(prefix));
  const next = lines.map((l) => (allHave ? l.slice(prefix.length) : prefix + stripped(l)));
  const replaced = next.join("\n");
  const delta = replaced.length - (to - from);
  return {
    text: text.slice(0, from) + replaced + text.slice(to),
    start: from,
    end: to + delta,
  };
}

/**
 * Starts a "term :: definition" line: on an empty line it adds the template; with text
 * selected, that text becomes the term and the cursor lands where the definition goes.
 */
export function insertCardLine(input: Selection): Selection {
  const { text, start, end } = normalize(input);
  const selected = text.slice(start, end).trim();
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
  const term = selected || "term";
  const insert = `${lead}${term} :: definition`;
  const defStart = start + lead.length + term.length + 4;
  return {
    text: before + insert + after,
    start: defStart,
    end: defStart + "definition".length,
  };
}
