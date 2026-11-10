// Notes: titles, counts, the "term :: definition" lines that become cards without any AI,
// and a small block parser for the formatted preview. Notes are plain text with a few
// Markdown-style marks; the preview is built from this parse (never from raw HTML), so
// nothing a note contains can run as markup. Pure, shared by web and mobile.
import { MAX_BACK_CHARS, MAX_FRONT_CHARS, type ImportedCard } from "./import.ts";

export const MAX_NOTE_TITLE_CHARS = 200;
export const MAX_NOTE_BODY_CHARS = 100_000;
export const UNTITLED_NOTE = "Untitled note";

/** The title to show: the note's title, else its first line, else "Untitled note". */
export function noteTitle(note: { title: string; body?: string }): string {
  const title = note.title.trim();
  if (title) return title;
  const firstLine = (note.body ?? "")
    .split("\n")
    .map((l) => l.replace(/^#{1,3}\s+/, "").trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 80) : UNTITLED_NOTE;
}

export interface NoteStats {
  words: number;
  characters: number;
  /** Lines that can become cards (see cardsFromNote). */
  cardLines: number;
}

export function noteStats(body: string): NoteStats {
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  return { words, characters: body.length, cardLines: cardsFromNote(body).length };
}

/** "1 word", "240 words". */
export function wordCountLabel(words: number): string {
  return `${String(words)} ${words === 1 ? "word" : "words"}`;
}

const CARD_LINE = /^(?:[-*]\s+)?(.+?)\s*::\s*(.+)$/;
const QUESTION_LINE = /^(?:[-*]\s+)?Q(?:uestion)?\s*[:.)]\s*(.+)$/i;
const ANSWER_LINE = /^(?:[-*]\s+)?A(?:nswer)?\s*[:.)]\s*(.+)$/i;

/**
 * Cards written inside a note, no AI needed:
 *   mitosis :: cell division that makes two identical cells
 *   Q: What does ATP store?   (then, on the next line)   A: Energy
 * Duplicates and over-long lines are left out.
 */
export function cardsFromNote(body: string): ImportedCard[] {
  const cards: ImportedCard[] = [];
  const seen = new Set<string>();
  const add = (front: string, back: string) => {
    const f = front.trim();
    const b = back.trim();
    if (!f || !b || f.length > MAX_FRONT_CHARS || b.length > MAX_BACK_CHARS) return;
    const key = `${f.toLowerCase()}\u0000${b.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    cards.push({ front: f, back: b });
  };
  let question: string | null = null;
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const answer = ANSWER_LINE.exec(line);
    if (question !== null && answer?.[1]) {
      add(question, answer[1]);
      question = null;
      continue;
    }
    const asked = QUESTION_LINE.exec(line);
    if (asked?.[1]) {
      question = asked[1];
      continue;
    }
    question = null;
    const pair = CARD_LINE.exec(line);
    if (pair?.[1] && pair[2]) add(pair[1], pair[2]);
  }
  return cards;
}

// Preview ---------------------------------------------------------------------------

export type NoteSpan =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "code"; text: string };

export type NoteBlock =
  | { type: "heading"; level: 1 | 2 | 3; spans: NoteSpan[] }
  | { type: "paragraph"; spans: NoteSpan[] }
  | { type: "list"; ordered: boolean; items: NoteSpan[][] }
  | { type: "checklist"; items: { done: boolean; spans: NoteSpan[] }[] }
  | { type: "card"; front: string; back: string }
  | { type: "quote"; spans: NoteSpan[] }
  | { type: "divider" };

const INLINE = /(\*\*([^*\n]+)\*\*|`([^`\n]+)`|\*([^*\n]+)\*|_([^_\n]+)_)/g;

/** **bold**, *italic* or _italic_, and `code`; everything else is plain text. */
export function parseSpans(text: string): NoteSpan[] {
  const spans: NoteSpan[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) spans.push({ type: "text", text: text.slice(last, m.index) });
    if (m[2] !== undefined) spans.push({ type: "bold", text: m[2] });
    else if (m[3] !== undefined) spans.push({ type: "code", text: m[3] });
    else spans.push({ type: "italic", text: m[4] ?? m[5] ?? "" });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ type: "text", text: text.slice(last) });
  return spans;
}

const HEADING = /^(#{1,3})\s+(.+)$/;
const BULLET = /^[-*]\s+(.+)$/;
const NUMBERED = /^\d{1,3}[.)]\s+(.+)$/;
const CHECK = /^[-*]\s+\[( |x|X)\]\s+(.+)$/;
const QUOTE = /^>\s?(.*)$/;
const DIVIDER = /^(?:-{3,}|\*{3,}|_{3,})$/;

/** Splits a note into blocks for the preview. Consecutive list lines become one list. */
export function parseNoteBlocks(body: string): NoteBlock[] {
  const blocks: NoteBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", spans: parseSpans(paragraph.join(" ")) });
      paragraph = [];
    }
  };
  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    const last = blocks[blocks.length - 1];
    const heading = HEADING.exec(line);
    const check = CHECK.exec(line);
    const card = CARD_LINE.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    const quote = QUOTE.exec(line);
    if (heading?.[1] && heading[2]) {
      flush();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        spans: parseSpans(heading[2]),
      });
    } else if (DIVIDER.test(line)) {
      flush();
      blocks.push({ type: "divider" });
    } else if (check?.[2]) {
      flush();
      const item = { done: check[1] !== " ", spans: parseSpans(check[2]) };
      if (last?.type === "checklist" && paragraph.length === 0) last.items.push(item);
      else blocks.push({ type: "checklist", items: [item] });
    } else if (card?.[1] && card[2]) {
      flush();
      blocks.push({ type: "card", front: card[1].trim(), back: card[2].trim() });
    } else if (bullet?.[1] || numbered?.[1]) {
      flush();
      const ordered = !bullet;
      const spans = parseSpans(bullet?.[1] ?? numbered?.[1] ?? "");
      if (last?.type === "list" && last.ordered === ordered) last.items.push(spans);
      else blocks.push({ type: "list", ordered, items: [spans] });
    } else if (quote) {
      flush();
      blocks.push({ type: "quote", spans: parseSpans(quote[1] ?? "") });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** A note as a plain-text file: the title, a blank line, then the body. */
export function noteAsText(note: { title: string; body: string }): string {
  return `${noteTitle(note)}\n\n${note.body.trimEnd()}\n`;
}

/** A safe file name for a downloaded note. */
export function noteFileName(note: { title: string; body?: string }): string {
  const base = noteTitle(note)
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${base || "note"}.txt`;
}
