// The 13+ age gate (launch safety S12), mirrored in SQL by private.age_in_years. We ask
// for a birth month and year, check it, and keep only the fact that it passed.
//
// Age is computed as if the birthday were the last day of the birth month, so rounding
// never lets anyone in early.

export const MIN_AGE = 13;

export const AGE_MESSAGES = {
  blocked: "Sorry, StudyPulse is for people 13 and older.",
  missing: "Enter your birth month and year.",
  why: "We ask to make sure StudyPulse is right for you. We don't keep your birth date.",
} as const;

/** Local-storage key that remembers a blocked attempt, so the form can't just be retried. */
export const AGE_BLOCK_KEY = "sp_age_blocked_at";
export const AGE_BLOCK_MS = 24 * 60 * 60 * 1000;

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** "YYYY-MM" from a year and a 1-based month, or null if either is out of range. */
export function toBirthMonth(year: number, month: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month)) return null;
  if (year < 1900 || year > 2099 || month < 1 || month > 12) return null;
  return `${String(year)}-${String(month).padStart(2, "0")}`;
}

/** Whole years of age today (a UTC calendar date), or null if the birth month is invalid. */
export function ageInYears(birthMonth: string, today: Date = new Date()): number | null {
  const m = /^(19|20)(\d{2})-(0[1-9]|1[0-2])$/.exec(birthMonth);
  if (!m) return null;
  const year = Number(`${m[1] ?? ""}${m[2] ?? ""}`);
  const month = Number(m[3]);
  // Last day of the birth month (day 0 of the next month).
  const birthday = new Date(Date.UTC(year, month, 0));
  const y = today.getUTCFullYear();
  const mo = today.getUTCMonth();
  const d = today.getUTCDate();
  if (Date.UTC(y, mo, d) < birthday.getTime()) return null;
  let age = y - birthday.getUTCFullYear();
  if (mo < birthday.getUTCMonth() || (mo === birthday.getUTCMonth() && d < birthday.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function isOldEnough(birthMonth: string, today: Date = new Date()): boolean {
  const age = ageInYears(birthMonth, today);
  return age !== null && age >= MIN_AGE;
}

/** Years to offer, newest first, neutrally (no default that nudges an answer). */
export function birthYearOptions(today: Date = new Date()): number[] {
  const current = today.getUTCFullYear();
  return Array.from({ length: 100 }, (_, i) => current - i);
}

/** Whether a blocked attempt recorded at `blockedAt` (ms) still applies. */
export function stillBlocked(blockedAt: number | null, now: number = Date.now()): boolean {
  return blockedAt !== null && now - blockedAt < AGE_BLOCK_MS;
}
