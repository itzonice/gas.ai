import {
  detectSyllabusFileType,
  htmlToText,
  joinPages,
  safeFetch,
  UnsafeUrlError,
} from "@studypulse/core/parser/index.ts";
import type { Logger } from "@studypulse/core/observability/index.ts";

import { ParseFailure } from "./errors.ts";
import { extractSyllabusText, type ExtractedText } from "./extract.ts";

/** Resolves A and AAAA records; a missing record type is not an error. */
async function resolveHost(hostname: string): Promise<string[]> {
  const settled = await Promise.allSettled([
    Deno.resolveDns(hostname, "A"),
    Deno.resolveDns(hostname, "AAAA"),
  ]);
  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

/** Fetches a syllabus URL (with SSRF protection) and converts it to page-marked text. */
export async function fetchSyllabusUrl(url: string, log: Logger): Promise<ExtractedText> {
  let page;
  try {
    page = await safeFetch(url, { resolve: resolveHost });
  } catch (error) {
    if (error instanceof UnsafeUrlError)
      throw new ParseFailure(`We couldn't open that link: ${error.message}.`, "url_rejected");
    log.warn("url fetch failed", { error });
    throw new ParseFailure(
      "We couldn't open that link. Check that it's public, or paste the text.",
      "url_fetch_failed",
    );
  }

  // Many syllabus links point straight at a PDF.
  if (detectSyllabusFileType(page.bytes.subarray(0, 1024)) === "pdf") {
    return await extractSyllabusText(page.bytes, log);
  }

  const type = page.contentType.toLowerCase();
  const body = new TextDecoder().decode(page.bytes);
  let text: string;
  if (type.includes("html") || /^\s*<(!doctype|html)/i.test(body)) text = htmlToText(body);
  else if (type.startsWith("text/") || type === "") text = body;
  else throw new ParseFailure("That link isn't a web page or PDF.", "url_unsupported_type");

  log.info("url fetched", {
    final_url: page.finalUrl,
    bytes: page.bytes.byteLength,
    content_type: type,
  });
  return { text: joinPages([text]), pageCount: 1, method: "url" };
}
