// Identify uploaded syllabus files by their leading bytes. The declared MIME type
// comes from the client and can't be trusted.

export type SyllabusFileType = "pdf" | "png" | "jpeg" | "webp" | "heic";

export const SYLLABUS_MAX_BYTES = 20 * 1024 * 1024;

export const SYLLABUS_MIME_TYPES: Record<SyllabusFileType, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
};

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

const ascii = (s: string) => Array.from(new TextEncoder().encode(s));

/** Returns the file type from its magic bytes, or null if it isn't an accepted type. */
export function detectSyllabusFileType(head: Uint8Array): SyllabusFileType | null {
  // PDFs may have up to 1 KB of junk before the header; real-world files do this.
  const pdfWindow = head.subarray(0, 1024);
  const pdfMarker = ascii("%PDF-");
  for (let i = 0; i + pdfMarker.length <= pdfWindow.length; i++) {
    if (startsWith(pdfWindow, pdfMarker, i)) return "pdf";
  }
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(head, ascii("RIFF")) && startsWith(head, ascii("WEBP"), 8)) return "webp";
  if (startsWith(head, ascii("ftyp"), 4)) {
    const brand = String.fromCharCode(...head.subarray(8, 12));
    if (["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand)) return "heic";
  }
  return null;
}

/** Storage paths must be `{userId}/{name}` with a single, safe file name. */
export function isOwnedStoragePath(path: string, userId: string): boolean {
  const parts = path.split("/");
  if (parts.length !== 2) return false;
  const [folder, name] = parts as [string, string];
  return folder === userId && /^[A-Za-z0-9._-]{1,200}$/.test(name) && !name.startsWith(".");
}
