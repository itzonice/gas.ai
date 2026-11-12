// Launch safety S34: request schemas are strict, so a key the API doesn't expect is an
// error instead of being carried toward a database filter or update.
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import * as schemas from "./schemas.ts";

/** Minimal valid inputs for schemas whose required fields are checked first. */
const BASE: Record<string, Record<string, unknown>> = {
  uploadSyllabusInputSchema: { source: "text", text: "BIO 201 syllabus ".repeat(10) },
};

const inputSchemas = Object.entries(schemas).filter(([name]) => name.endsWith("InputSchema")) as [
  string,
  z.ZodType,
][];

describe("API input schemas (S34)", () => {
  it("finds them", () => {
    expect(inputSchemas.length).toBeGreaterThan(15);
  });

  it.each(inputSchemas)("%s refuses unexpected keys", (name, schema) => {
    const result = schema.safeParse({ ...(BASE[name] ?? {}), user_id: "someone-else" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.code)).toContain("unrecognized_keys");
  });
});
