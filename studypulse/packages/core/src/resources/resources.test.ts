import { describe, expect, it } from "vitest";

import { addResourceInputSchema, detectResourceKind } from "./index.ts";

describe("detectResourceKind", () => {
  it("recognizes the study tools by host", () => {
    expect(detectResourceKind("https://www.khanacademy.org/math/algebra")).toBe("khan_academy");
    expect(detectResourceKind("https://khanacademy.org/")).toBe("khan_academy");
    expect(detectResourceKind("https://notebooklm.google.com/notebook/abc")).toBe("notebooklm");
    expect(detectResourceKind("https://ankiweb.net/shared/info/123")).toBe("anki_deck");
    expect(detectResourceKind("https://ankiweb.net/decks")).toBe("other");
    expect(detectResourceKind("https://example.edu/notes.pdf")).toBe("other");
  });

  it("isn't fooled by look-alike hosts", () => {
    expect(detectResourceKind("https://khanacademy.org.evil.example/")).toBe("other");
    expect(detectResourceKind("https://evil.example/khanacademy.org")).toBe("other");
    expect(detectResourceKind("https://notebooklm.google.com.evil.example/")).toBe("other");
  });

  it("rejects non-https and malformed links", () => {
    expect(detectResourceKind("http://www.khanacademy.org/")).toBeNull();
    expect(detectResourceKind("javascript:alert(1)")).toBeNull();
    expect(detectResourceKind("https://user:pw@example.edu/")).toBeNull();
    expect(detectResourceKind("not a url")).toBeNull();
  });
});

describe("addResourceInputSchema", () => {
  it("adds the detected kind and normalizes the URL", () => {
    expect(
      addResourceInputSchema.parse({
        assignmentId: "5b1f3c6e-8d2a-4f7b-9c1e-2a3b4c5d6e7f",
        url: " https://WWW.khanacademy.org/science ",
      }),
    ).toEqual({
      assignmentId: "5b1f3c6e-8d2a-4f7b-9c1e-2a3b4c5d6e7f",
      url: "https://www.khanacademy.org/science",
      kind: "khan_academy",
    });
    const bad = addResourceInputSchema.safeParse({
      assignmentId: "5b1f3c6e-8d2a-4f7b-9c1e-2a3b4c5d6e7f",
      url: "ftp://example.edu",
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe("Use a full https:// link");
  });
});
