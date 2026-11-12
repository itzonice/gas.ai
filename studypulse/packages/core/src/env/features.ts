// Which optional features are on, from the environment. A feature is on only when every
// variable it needs is set (non-blank); otherwise it's off and the code that uses it
// skips it or answers "not configured". Nothing here throws. Used by the edge functions
// (the `features` endpoint), and by `pnpm deploy:check`, which lists what's missing.

export type FeatureName =
  | "deploy"
  | "ai"
  | "stripe"
  | "revenuecat"
  | "email"
  | "webPush"
  | "googleCalendar"
  | "analytics"
  | "cron"
  | "business";

export interface FeatureSpec {
  label: string;
  /** Variables that must all be set for the feature to be on. */
  requires: readonly string[];
  /** What happens while it's off. */
  whenOff: string;
  /** Read by deploy tooling on your machine, not by the running app. */
  deployOnly?: boolean;
}

export const FEATURES: Record<FeatureName, FeatureSpec> = {
  deploy: {
    label: "Deploy (Supabase + Vercel)",
    requires: [
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_PROJECT_REF",
      "SUPABASE_DB_PASSWORD",
      "VERCEL_TOKEN",
    ],
    whenOff: "Nothing can be deployed from this environment; the app still runs locally.",
    deployOnly: true,
  },
  ai: {
    label: "AI syllabus parsing and notes-to-cards",
    requires: ["ANTHROPIC_API_KEY"],
    whenOff:
      "Uploads fail with 'Syllabus parsing is temporarily unavailable'; card generation returns 503.",
  },
  stripe: {
    label: "Web billing (Stripe)",
    requires: [
      "STRIPE_SECRET_KEY",
      "STRIPE_PRICE_MONTHLY",
      "STRIPE_PRICE_YEARLY",
      "STRIPE_WEBHOOK_SECRET",
      "APP_URL",
    ],
    whenOff:
      "Checkout, portal, and webhook return 503 billing_not_configured; Pro comes only from the database.",
  },
  revenuecat: {
    label: "Mobile billing (RevenueCat webhook)",
    requires: ["REVENUECAT_WEBHOOK_AUTH"],
    whenOff:
      "The webhook returns 503 billing_not_configured; store purchases don't reach the database.",
  },
  email: {
    label: "Email digest (Resend)",
    requires: ["RESEND_API_KEY", "EMAIL_FROM", "EMAIL_UNSUBSCRIBE_SECRET", "APP_URL"],
    whenOff: "The digest job skips (logged once per run); push reminders still go out.",
  },
  webPush: {
    label: "Web push (VAPID)",
    requires: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"],
    whenOff: "Reminders skip web push (logged once per run); Expo push still goes out.",
  },
  googleCalendar: {
    label: "Google Calendar sync",
    requires: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    whenOff:
      "Connecting returns 503 google_not_configured; the sync cron skips; plans ignore busy time.",
  },
  analytics: {
    label: "Product analytics (PostHog)",
    requires: ["POSTHOG_API_KEY"],
    whenOff: "Events wait in the database outbox; the flush job skips.",
  },
  cron: {
    label: "Scheduled jobs (pg_cron -> functions)",
    requires: ["CRON_SECRET"],
    whenOff: "Scheduled endpoints refuse every call (reminders, replans, syncs don't run).",
  },
  business: {
    label: "Business name and address (footer, checkout, emails)",
    requires: [
      "NEXT_PUBLIC_COMPANY_LEGAL_NAME",
      "NEXT_PUBLIC_COMPANY_ADDRESS",
      "COMPANY_LEGAL_NAME",
      "COMPANY_POSTAL_ADDRESS",
    ],
    whenOff:
      "The footer, checkout, and legal pages show [Company legal name] placeholders; marketing email refuses to send.",
  },
};

export interface FeatureStatus {
  enabled: boolean;
  missing: string[];
}

const isSet = (value: string | undefined) => value !== undefined && value.trim() !== "";

export function featureStatus(
  env: Readonly<Record<string, string | undefined>>,
): Record<FeatureName, FeatureStatus> {
  const out = {} as Record<FeatureName, FeatureStatus>;
  for (const [name, spec] of Object.entries(FEATURES) as [FeatureName, FeatureSpec][]) {
    const missing = spec.requires.filter((v) => !isSet(env[v]));
    out[name] = { enabled: missing.length === 0, missing };
  }
  return out;
}

/** Just the on/off flags (safe to show to anyone: no variable names or values). */
export function featureFlags(
  env: Readonly<Record<string, string | undefined>>,
  names: readonly FeatureName[] = Object.keys(FEATURES) as FeatureName[],
): Partial<Record<FeatureName, boolean>> {
  const status = featureStatus(env);
  return Object.fromEntries(names.map((n) => [n, status[n].enabled]));
}
