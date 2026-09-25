import { describe, expect, it } from "vitest";

import type { AiCallError } from "./ai.ts";
import { fakeClient } from "./fake-client.ts";
import { ocrSyllabus } from "./ocr.ts";

describe("ocrSyllabus", () => {
  it("sends the PDF as a document and returns normalized, page-marked text", async () => {
    const { client, calls } = fakeClient([
      { text: "--- Page 1 ---\nBIO 201   Syllabus\n--- Page 2 ---\nMidterm – March 4" },
    ]);
    const result = await ocrSyllabus(client, { kind: "pdf", base64: "JVBERi0=" });
    expect(result.text).toBe(
      "--- Page 1 ---\nBIO 201 Syllabus\n\n--- Page 2 ---\nMidterm - March 4",
    );
    expect(result.pageCount).toBe(2);
    const content = (calls[0]?.messages as { content: { type: string }[] }[])[0]?.content;
    expect(content?.[0]?.type).toBe("document");
    expect(calls[0]).toMatchObject({ fallbacks: "default", output_config: { effort: "low" } });
  });

  it("surfaces refusals as AiCallError", async () => {
    const { client } = fakeClient([{ text: "", stop_reason: "refusal" }]);
    await expect(
      ocrSyllabus(client, { kind: "image", base64: "x", mediaType: "image/png" }),
    ).rejects.toMatchObject({ kind: "refusal" } satisfies Partial<AiCallError>);
  });
});
