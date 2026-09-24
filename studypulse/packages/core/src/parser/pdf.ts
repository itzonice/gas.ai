import { extractText, getDocumentProxy } from "unpdf";

export interface PdfText {
  pageCount: number;
  /** Raw text per page, in page order. */
  pages: string[];
}

/** Maximum pages we read from a syllabus PDF; longer files are course packets, not syllabi. */
export const MAX_PDF_PAGES = 60;

/** Extracts the text layer of a PDF (no OCR). Throws if the file can't be opened. */
export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  // pdf.js takes ownership of the buffer, so hand it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    return { pageCount: totalPages, pages: text.slice(0, MAX_PDF_PAGES) };
  } finally {
    await pdf.loadingTask.destroy();
  }
}
