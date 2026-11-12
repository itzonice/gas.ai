// Onboarding choices shared by web and mobile (launch audit L5). Every step can be
// skipped; skipping keeps these defaults, and the timezone always comes from the device.

/** Daily study time choices, in minutes. */
export const DAILY_MINUTES_OPTIONS = [30, 60, 90, 120, 150, 180, 240, 300, 360] as const;
export const DEFAULT_DAILY_MINUTES = 120;

/** When study time usually starts (local HH:MM). */
export const STUDY_START_OPTIONS = ["15:00", "16:00", "17:00", "18:00", "19:00", "20:00"] as const;
export const DEFAULT_STUDY_START = "16:00";

/** "16:00" -> "4:00 PM". */
export function clockLabel(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${String(hour)}:${String(m).padStart(2, "0")} ${suffix}`;
}
