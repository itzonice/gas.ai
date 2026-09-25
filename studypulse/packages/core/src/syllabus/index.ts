// Browser-safe syllabus types and review helpers for the apps. The full parser (PDF,
// OCR, prompts) stays in ./parser, which only edge functions import.
export { commitPayloadSchema, type CommitPayload } from "../parser/commit.ts";
export {
  parseResultSchema,
  type ParseResult,
  type ParsedAssignment,
  type ParsedCategory,
  type ParsedMeeting,
} from "../parser/result.ts";
export { ASSIGNMENT_KINDS } from "../parser/prompts/v1/schema.ts";
export { MEETING_KINDS, WEEKDAYS } from "../parser/prompts/v2/schema.ts";
export * from "./review.ts";
