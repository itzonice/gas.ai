// Shared business logic for StudyPulse (grades, priority, scheduling, parser).
// Consumed as TypeScript source by apps/web, apps/mobile, and edge functions.
export type { Database } from "@studypulse/db";

export * from "./env/index.ts";

export const APP_NAME = "StudyPulse";
