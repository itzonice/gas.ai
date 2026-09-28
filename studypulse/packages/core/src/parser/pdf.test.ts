import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { extractPdfText } from "./pdf.ts";
import { joinPages, needsOcr } from "./text.ts";

const fixture = (name: string) =>
  new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe("extractPdfText", () => {
  it("reads the text layer page by page", async () => {
    const { pageCount, pages } = await extractPdfText(fixture("two-page.pdf"));
    expect(pageCount).toBe(2);
    expect(pages[0]).toContain("BIO 201: Cell Biology");
    expect(pages[1]).toContain("Midterm Exam: March 4");
    const text = joinPages(pages);
    expect(text).toMatch(/^--- Page 1 ---\nBIO 201/);
    expect(text).toContain("--- Page 2 ---\nSchedule");
  });

  it("flags a PDF with no text layer for OCR", async () => {
    const { pages } = await extractPdfText(fixture("blank.pdf"));
    expect(needsOcr(pages)).toBe(true);
  });

  it("throws on bytes that are not a PDF", async () => {
    await expect(extractPdfText(new TextEncoder().encode("%PDF-1.4 garbage"))).rejects.toThrow();
  });
});
