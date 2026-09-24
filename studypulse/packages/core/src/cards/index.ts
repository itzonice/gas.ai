// Flashcard export: Anki (CSV with import headers) and Quizlet (TSV).

export interface Card {
  front: string;
  back: string;
  tags?: readonly string[];
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** RFC 4180 field: quoted, with inner quotes doubled. */
const csvField = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Anki tags can't contain spaces; use underscores (Anki's own convention). */
export const ankiTag = (tag: string) => tag.trim().replace(/\s+/g, "_");

/**
 * Anki text import (2.1.55+). The header lines tell Anki the separator, that fields
 * are HTML, which deck to use, and which column holds tags, so a double-click import
 * needs no manual setup. Newlines become <br> and text is HTML-escaped.
 */
export function toAnkiCsv(cards: readonly Card[], deckName: string): string {
  const field = (s: string) => csvField(escapeHtml(s.trim()).replace(/\r?\n/g, "<br>"));
  const deck = deckName.replace(/[\r\n]+/g, " ").trim() || "StudyPulse";
  const lines = [
    "#separator:Comma",
    "#html:true",
    `#deck:${deck}`,
    "#notetype:Basic",
    "#columns:Front,Back,Tags",
    "#tags column:3",
    ...cards.map((c) =>
      [
        field(c.front),
        field(c.back),
        csvField((c.tags ?? []).map(ankiTag).filter(Boolean).join(" ")),
      ].join(","),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * Quizlet import: one card per line, term and definition separated by a tab.
 * Quizlet's importer can't take tabs or newlines inside a field, so they become spaces.
 */
export function toQuizletTsv(cards: readonly Card[]): string {
  const field = (s: string) =>
    s
      .replace(/[\t\r\n]+/g, " ")
      .replace(/ {2,}/g, " ")
      .trim();
  return (
    cards.map((c) => `${field(c.front)}\t${field(c.back)}`).join("\n") + (cards.length ? "\n" : "")
  );
}

export type CardExportFormat = "anki" | "quizlet";

export function exportCards(
  cards: readonly Card[],
  format: CardExportFormat,
  deckName: string,
): { body: string; contentType: string; extension: string } {
  return format === "anki"
    ? { body: toAnkiCsv(cards, deckName), contentType: "text/csv; charset=utf-8", extension: "csv" }
    : {
        body: toQuizletTsv(cards),
        contentType: "text/tab-separated-values; charset=utf-8",
        extension: "tsv",
      };
}
