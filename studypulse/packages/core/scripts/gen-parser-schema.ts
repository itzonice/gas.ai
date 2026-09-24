// Writes the JSON Schema for each prompt version next to its zod schema, so the
// schema sent to the model is reviewable in diffs. Run: pnpm --filter @studypulse/core parser:schema
import { writeFileSync } from "node:fs";

import { z } from "zod";

import { PROMPTS } from "../src/parser/prompts/index.ts";

for (const [version, prompt] of Object.entries(PROMPTS)) {
  const dir = version.replace("syllabus-", "");
  const path = new URL(`../src/parser/prompts/${dir}/schema.json`, import.meta.url);
  writeFileSync(path, `${JSON.stringify(z.toJSONSchema(prompt.schema), null, 2)}\n`);
  console.log(`wrote ${path.pathname}`);
}
