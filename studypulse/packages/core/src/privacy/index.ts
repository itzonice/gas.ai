// Consent and the storage inventory (launch safety S23–S24). The cookie policy page is
// rendered from STORAGE_INVENTORY, so it lists exactly what the app stores.

/** The privacy/cookie policy consents are recorded against (SQL: current_privacy_version). */
export const PRIVACY_VERSION = "2026-09-25";

/** EU and EEA countries, the UK, and Switzerland: ask before anything optional runs. */
export const CONSENT_FIRST_COUNTRIES = new Set([
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  "GB",
  "CH",
]);

/**
 * Whether visitors from this country must opt in first. Unknown country (no geo header,
 * e.g. local development or a proxy) counts as "must opt in": the safe default.
 */
export function consentRequired(country: string | null | undefined): boolean {
  if (!country) return true;
  return CONSENT_FIRST_COUNTRIES.has(country.trim().toUpperCase());
}

export interface PrivacyChoices {
  /** Product analytics (server-side PostHog events about how StudyPulse is used). */
  analytics: boolean;
  /** Browser error reports to Sentry (through our own server). */
  errorReports: boolean;
}

export interface StoredChoices extends PrivacyChoices {
  version: string;
  /** ISO time the choice was made. */
  at: string;
}

export const CONSENT_STORAGE_KEY = "studypulse.privacy-choices";

/** What applies before the visitor chooses. */
export function defaultChoices(required: boolean): PrivacyChoices {
  return required
    ? { analytics: false, errorReports: false }
    : { analytics: true, errorReports: true };
}

export interface StorageItem {
  name: string;
  kind: "localStorage" | "sessionStorage" | "cookie" | "service worker";
  purpose: string;
  /** Essential items run without consent; the rest only after opting in. */
  essential: boolean;
  lifetime: string;
}

/** Every cookie and storage key the web app uses. None are advertising or tracking. */
export const STORAGE_INVENTORY: readonly StorageItem[] = [
  {
    name: "sb-<project>-auth-token",
    kind: "localStorage",
    purpose: "Keeps you signed in (your session with our database host, Supabase).",
    essential: true,
    lifetime: "Until you sign out",
  },
  {
    name: "sb-<project>-auth-token-code-verifier",
    kind: "localStorage",
    purpose: "Completes Sign in with Apple or Google securely.",
    essential: true,
    lifetime: "Minutes (removed after sign-in)",
  },
  {
    name: CONSENT_STORAGE_KEY,
    kind: "localStorage",
    purpose: "Remembers your choices on this page, so we don't ask again.",
    essential: true,
    lifetime: "Until you change them or clear your browser",
  },
  {
    name: "studypulse.focus-run",
    kind: "localStorage",
    purpose: "Keeps a running focus timer if you reload the page.",
    essential: true,
    lifetime: "Until the session ends",
  },
  {
    name: "sp_age_blocked_at",
    kind: "localStorage",
    purpose: "Remembers an age check that didn't pass, for a day (required by law).",
    essential: true,
    lifetime: "24 hours",
  },
  {
    name: "sw.js (push subscription)",
    kind: "service worker",
    purpose: "Delivers the reminders you turned on in this browser.",
    essential: true,
    lifetime: "Until you turn reminders off",
  },
];

/** The optional processing, off until chosen in the EU and UK. */
export const OPTIONAL_PROCESSING = [
  {
    choice: "analytics" as const,
    name: "Product analytics",
    purpose:
      "Counts of what's used (for example, a syllabus imported or a session logged), sent from our servers to PostHog. No cookies, no advertising, no names or course content.",
  },
  {
    choice: "errorReports" as const,
    name: "Error reports",
    purpose:
      "When something breaks in your browser, technical details go through our servers to Sentry so we can fix it. Names, emails, and cookies are removed first.",
  },
];
