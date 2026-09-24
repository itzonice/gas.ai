// Versioned parser prompts. CURRENT_PROMPT is what new parses use; older versions stay
// here so evals can compare them and stored results can be traced to their prompt.
import * as v1Prompt from "./v1/prompt.ts";
import { aiSyllabusSchemaV1 } from "./v1/schema.ts";

export type { PromptContext } from "./v1/prompt.ts";
export * from "./v1/schema.ts";

export const PROMPTS = {
  "syllabus-v1": {
    version: v1Prompt.PROMPT_VERSION,
    system: v1Prompt.SYSTEM_PROMPT,
    buildUserMessage: v1Prompt.buildUserMessage,
    schema: aiSyllabusSchemaV1,
  },
} as const;

export type PromptVersion = keyof typeof PROMPTS;

export const CURRENT_PROMPT = PROMPTS["syllabus-v1"];
