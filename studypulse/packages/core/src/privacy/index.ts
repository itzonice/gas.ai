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
    name: "studypulse.review-draft.<upload>",
    kind: "localStorage",
    purpose: "Keeps your unsaved edits to a syllabus review if you leave the page.",
    essential: true,
    lifetime: "Until you save the review, or 14 days",
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
export * from "./data-inventory.ts";

/**
 * The in-app AI disclosure (launch audit L2-AI; App Store 5.1.2(i), Google Play user data
 * policy). Shown before the first syllabus or card generation, and in Settings. It must
 * name the provider, say what is sent and why, and ask for a clear yes. Web, mobile, and
 * the privacy policy all render this text, so they can't drift apart.
 */
export const AI_DISCLOSURE = {
  provider: "Anthropic",
  providerUrl: "https://www.anthropic.com/legal/privacy",
  title: "Send this to our AI provider?",
  purpose:
    "StudyPulse uses Claude, an AI model made by Anthropic, to read your syllabi and turn your notes into study cards.",
  sent: [
    "The syllabus you upload, paste, or link (its text, or the PDF or photo itself)",
    "Notes you ask to turn into study cards, and the course name",
  ],
  notSent: "Your name, email address, grades, and account details are not sent.",
  use: "Anthropic processes it only to send the result back to us and, under its commercial terms, doesn't train its models on it.",
  accuracy: "AI can make mistakes. You review every date and grade before anything is saved.",
  choice:
    "You can turn this off anytime in Settings. You can still add courses and assignments by hand.",
  allow: "Allow and continue",
  decline: "Not now",
  settingLabel: "Use AI to read syllabi and make study cards",
  settingHint:
    "Sends the syllabus or notes you submit to Anthropic, our AI provider. Nothing else is sent.",
} as const;
