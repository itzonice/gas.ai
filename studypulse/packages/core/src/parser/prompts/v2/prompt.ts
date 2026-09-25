// Syllabus parsing prompt, version 2: v1's instructions plus class meeting times. v1
// stays unchanged; v2 reuses its text and adds one section.
import { SYSTEM_PROMPT as V1_SYSTEM_PROMPT } from "../v1/prompt.ts";

export { buildUserMessage, type PromptContext } from "../v1/prompt.ts";

export const PROMPT_VERSION = "syllabus-v2";

const MEETINGS_SECTION = `Class meetings: the regular weekly schedule if the syllabus states days and times (e.g. "MWF 10:00-10:50", "Tue/Thu 2:30-3:45 PM", "Lab: Wednesdays 1-4pm"). Output one entry per weekday per meeting type, with local 24-hour start and end times, whether it is a lecture, lab, discussion section, or other, and the room if given. If only the days or only the times are stated, or the schedule varies week to week, output no meetings and add a warning. Office hours are not class meetings.`;

const anchor = "Grading scale: letter grade cutoffs";
if (!V1_SYSTEM_PROMPT.includes(anchor)) throw new Error("v1 prompt anchor moved");

export const SYSTEM_PROMPT = V1_SYSTEM_PROMPT.replace(anchor, `${MEETINGS_SECTION}\n\n${anchor}`);
