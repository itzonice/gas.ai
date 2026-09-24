import { describe, expect, it } from "vitest";

import { detectSyllabusFileType, isOwnedStoragePath } from "./file-type.ts";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? Array.from(new TextEncoder().encode(p)) : p)),
  );

describe("detectSyllabusFileType", () => {
  it("recognizes supported formats by magic bytes", () => {
    expect(detectSyllabusFileType(bytes("%PDF-1.7\n"))).toBe("pdf");
    expect(detectSyllabusFileType(bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(detectSyllabusFileType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(detectSyllabusFileType(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("webp");
    expect(detectSyllabusFileType(bytes([0, 0, 0, 0x18], "ftypheic"))).toBe("heic");
  });

  it("finds a PDF header after leading junk", () => {
    expect(detectSyllabusFileType(bytes("\n\n  garbage", "%PDF-1.4"))).toBe("pdf");
  });

  it("rejects other files even if they claim to be PDFs", () => {
    expect(detectSyllabusFileType(bytes("<html><body>"))).toBeNull();
    expect(detectSyllabusFileType(bytes("PK", [3, 4]))).toBeNull(); // .docx/.zip
    expect(detectSyllabusFileType(new Uint8Array())).toBeNull();
  });
});

describe("isOwnedStoragePath", () => {
  const user = "5b1f3c6e-8d2a-4f7b-9c1e-2a3b4c5d6e7f";
  it("accepts a single file in the user's folder", () => {
    expect(isOwnedStoragePath(`${user}/bio-101.pdf`, user)).toBe(true);
  });
  it("rejects other folders, nesting, and traversal", () => {
    expect(isOwnedStoragePath(`someone-else/bio.pdf`, user)).toBe(false);
    expect(isOwnedStoragePath(`${user}/a/b.pdf`, user)).toBe(false);
    expect(isOwnedStoragePath(`${user}/../x.pdf`, user)).toBe(false);
    expect(isOwnedStoragePath(`${user}/.hidden`, user)).toBe(false);
  });
});
