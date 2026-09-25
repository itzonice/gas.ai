// Plan limits for display (upgrade prompts, the upload screen). The database enforces
// them: private.parse_limits() in supabase/migrations/*_parse_limits.sql is the source
// of truth, and supabase/tests/database/110_parse_limits.test.sql pins these values.
import type { Database } from "@studypulse/db";

export type PlanTier = Database["public"]["Enums"]["plan_tier"];
export type SyllabusSource = Database["public"]["Enums"]["syllabus_source"];

export interface ParseLimits {
  dailyParses: number;
  allowedSources: readonly SyllabusSource[];
  /** Reading scanned PDFs and photos. */
  ocrAllowed: boolean;
}

export const PARSE_LIMITS: Record<PlanTier, ParseLimits> = {
  free: { dailyParses: 3, allowedSources: ["pdf", "text"], ocrAllowed: false },
  pro: { dailyParses: 25, allowedSources: ["pdf", "image", "text", "url"], ocrAllowed: true },
};

/** Free vs Pro, for the upgrade screen. Each limit is enforced in the database. */
export const PLAN_FEATURES: readonly { label: string; free: string; pro: string }[] = [
  { label: "Active courses", free: "3", pro: "Unlimited" },
  {
    label: "Syllabus imports a day",
    free: String(PARSE_LIMITS.free.dailyParses),
    pro: String(PARSE_LIMITS.pro.dailyParses),
  },
  { label: "Import from", free: "PDF and pasted text", pro: "PDF, photos, text, and links" },
  { label: "Scanned PDFs and photos (OCR)", free: "No", pro: "Yes" },
  { label: "Notes-to-cards a day", free: "5", pro: "50" },
];
