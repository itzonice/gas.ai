// Output schema for syllabus prompt v2: v1 plus the class meeting schedule, which the
// study system uses to create a card-making task after each class (prompt 71).
import { z } from "zod";

import { aiSyllabusSchemaV1 } from "../v1/schema.ts";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export const MEETING_KINDS = ["lecture", "lab", "discussion", "other"] as const;

const localTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:MM (24-hour)");

export const aiMeetingSchema = z.object({
  weekday: z.enum(WEEKDAYS),
  start_time: localTime.describe("Local 24-hour start time (HH:MM)"),
  end_time: localTime.describe("Local 24-hour end time (HH:MM)"),
  kind: z.enum(MEETING_KINDS).describe("lecture, lab, discussion section, or other"),
  location: z.string().nullable().describe("Room or 'Online', if stated"),
});

export const aiSyllabusSchemaV2 = aiSyllabusSchemaV1.extend({
  meetings: z
    .array(aiMeetingSchema)
    .describe("Regular weekly class meetings with stated days and times; empty if not given"),
});

export type AiMeetingV2 = z.infer<typeof aiMeetingSchema>;
export type AiSyllabusV2 = z.infer<typeof aiSyllabusSchemaV2>;
