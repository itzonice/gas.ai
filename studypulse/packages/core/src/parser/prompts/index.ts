// Versioned parser prompts. CURRENT_PROMPT is what new parses use; older versions stay
// here so evals can compare them and stored results can be traced to their prompt.
import * as v1Prompt from "./v1/prompt.ts";
import { aiSyllabusSchemaV1, type AiSyllabusV1 } from "./v1/schema.ts";
import * as v2Prompt from "./v2/prompt.ts";
import { aiSyllabusSchemaV2, type AiMeetingV2 } from "./v2/schema.ts";

export type { PromptContext } from "./v1/prompt.ts";
export * from "./v1/schema.ts";
export * from "./v2/schema.ts";

/** The extraction from any prompt version; `meetings` exists from v2 on. */
export type AiSyllabus = AiSyllabusV1 & { meetings?: AiMeetingV2[] };

export const PROMPTS = {
  "syllabus-v1": {
    version: v1Prompt.PROMPT_VERSION,
    system: v1Prompt.SYSTEM_PROMPT,
    buildUserMessage: v1Prompt.buildUserMessage,
    schema: aiSyllabusSchemaV1,
  },
  "syllabus-v2": {
    version: v2Prompt.PROMPT_VERSION,
    system: v2Prompt.SYSTEM_PROMPT,
    buildUserMessage: v2Prompt.buildUserMessage,
    schema: aiSyllabusSchemaV2,
  },
} as const;

export type PromptVersion = keyof typeof PROMPTS;

export const CURRENT_PROMPT = PROMPTS["syllabus-v2"];
