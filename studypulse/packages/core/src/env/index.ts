// Environment schemas for every runtime. Each runtime reads its own variables
// (Next.js and Expo only inline public vars that are referenced literally), then
// validates them here so a missing or malformed variable fails fast at startup.
import { z } from "zod";

const url = z.url();
const nonEmpty = z.string().trim().min(1);
const optionalNonEmpty = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();
const optionalUrl = optionalNonEmpty.pipe(url.optional());

export const appEnvSchema = z.enum(["development", "preview", "production"]);
export type AppEnv = z.infer<typeof appEnvSchema>;

/** Variables safe to ship to the browser (NEXT_PUBLIC_*). */
export const webPublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_ENV: appEnvSchema.default("development"),
  NEXT_PUBLIC_SUPABASE_URL: url,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
  NEXT_PUBLIC_SENTRY_DSN: optionalUrl,
  // VAPID public key for web push subscriptions (same value as the edge VAPID_PUBLIC_KEY).
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: optionalNonEmpty,
});
export type WebPublicEnv = z.infer<typeof webPublicEnvSchema>;

/** Server-only variables for Next.js route handlers and server actions. */
export const webServerEnvSchema = webPublicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
});
export type WebServerEnv = z.infer<typeof webServerEnvSchema>;

/** Variables bundled into the Expo app (EXPO_PUBLIC_*). Never put secrets here. */
export const mobileEnvSchema = z.object({
  EXPO_PUBLIC_APP_ENV: appEnvSchema.default("development"),
  EXPO_PUBLIC_SUPABASE_URL: url,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: nonEmpty,
  EXPO_PUBLIC_SENTRY_DSN: optionalUrl,
  // RevenueCat public SDK keys (appl_... / goog_...). Public by design, safe to ship.
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: optionalNonEmpty,
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: optionalNonEmpty,
});
export type MobileEnv = z.infer<typeof mobileEnvSchema>;

/**
 * Variables for Supabase Edge Functions. SUPABASE_URL, SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY are injected by the platform; the rest are secrets
 * set with `supabase secrets set`.
 */
export const edgeEnvSchema = z.object({
  APP_ENV: appEnvSchema.default("development"),
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: nonEmpty,
  SUPABASE_SERVICE_ROLE_KEY: nonEmpty,
  ANTHROPIC_API_KEY: optionalNonEmpty,
  // Model used for syllabus parsing and OCR; defaults to the parser's default model.
  PARSER_MODEL: optionalNonEmpty,
  SENTRY_DSN: optionalUrl,
  // Expo access token, only if push security is enabled for the Expo project.
  EXPO_ACCESS_TOKEN: optionalNonEmpty,
  // Expo push API base URL override (tests/staging); defaults to https://exp.host.
  EXPO_API_URL: optionalUrl,
  // Web push (VAPID). All three are needed; without them web users get no push.
  // Generate with `pnpm --filter @studypulse/core vapid:keys`.
  VAPID_PUBLIC_KEY: optionalNonEmpty,
  VAPID_PRIVATE_KEY: optionalNonEmpty,
  VAPID_SUBJECT: optionalNonEmpty.pipe(
    z
      .string()
      .regex(/^(mailto:|https:\/\/)/, "must be a mailto: or https: URL")
      .optional(),
  ),
  // Email digest (Resend) for users push doesn't reach. Unset = no emails are sent.
  RESEND_API_KEY: optionalNonEmpty,
  // Resend API base URL override (tests/staging); defaults to https://api.resend.com.
  RESEND_API_URL: optionalUrl,
  // Verified Resend sender, e.g. "StudyPulse <reminders@mail.studypulse.app>".
  EMAIL_FROM: optionalNonEmpty,
  // Signs email unsubscribe links (at least 32 characters). Rotating it breaks old links.
  EMAIL_UNSUBSCRIBE_SECRET: optionalNonEmpty.pipe(z.string().min(32).optional()),
  // Web app origin for links in emails, e.g. https://app.studypulse.app.
  APP_URL: optionalUrl,
  // Stripe (web billing). Unset = checkout and portal endpoints return 503.
  STRIPE_SECRET_KEY: optionalNonEmpty,
  STRIPE_PRICE_MONTHLY: optionalNonEmpty,
  STRIPE_PRICE_YEARLY: optionalNonEmpty,
  // Signing secret of the Stripe webhook endpoint (whsec_...).
  STRIPE_WEBHOOK_SECRET: optionalNonEmpty,
  // Authorization header value RevenueCat sends to revenuecat-webhook (set in its dashboard).
  REVENUECAT_WEBHOOK_AUTH: optionalNonEmpty.pipe(z.string().min(24).optional()),
  // Stripe coupon for the student discount (no public code; codes are minted per student).
  STRIPE_STUDENT_COUPON_ID: optionalNonEmpty,
  // Extra academic email domains beyond *.edu / *.ac.xx / *.edu.xx, comma-separated.
  STUDENT_EMAIL_DOMAINS: optionalNonEmpty,
  // Optional Stripe-Version pin; unset uses the account default.
  STRIPE_API_VERSION: optionalNonEmpty,
  // Stripe API base URL override (tests, e.g. stripe-mock).
  STRIPE_API_URL: optionalUrl,
  // Canvas OAuth redirect URI override; defaults to <SUPABASE_URL>/functions/v1/canvas-oauth/callback.
  CANVAS_REDIRECT_URI: optionalUrl,
  // PostHog project API key (phc_...) for server-side events. Unset = events wait in the outbox.
  POSTHOG_API_KEY: optionalNonEmpty,
  // PostHog ingestion host; defaults to https://us.i.posthog.com (EU: https://eu.i.posthog.com).
  POSTHOG_HOST: optionalUrl,
  // AI cost alerts (ai-cost-monitor): cents over the last 24 hours, per user and in total.
  AI_COST_ALERT_USER_CENTS: z.coerce.number().positive().default(100),
  AI_COST_ALERT_TOTAL_CENTS: z.coerce.number().positive().default(5000),
  // Optional Slack-compatible incoming webhook for operational alerts.
  ALERT_WEBHOOK_URL: optionalUrl,
  // Shared secret pg_cron sends (x-cron-secret) to scheduled functions. Unset = cron endpoints refuse all calls.
  CRON_SECRET: optionalNonEmpty,
});
export type EdgeEnv = z.infer<typeof edgeEnvSchema>;

export class EnvError extends Error {
  readonly runtime: string;
  readonly issues: readonly string[];

  constructor(runtime: string, issues: readonly string[]) {
    super(`Invalid ${runtime} environment:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvError";
    this.runtime = runtime;
    this.issues = issues;
  }
}

/**
 * Validates `source` against `schema`. Error messages name the variable and the
 * problem but never echo the value, so secrets don't leak into logs.
 */
export function parseEnv<S extends z.ZodType>(
  runtime: string,
  schema: S,
  source: Record<string, string | undefined>,
): z.infer<S> {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => {
    const key = issue.path.join(".") || "(root)";
    return issue.code === "invalid_type" && source[key] === undefined
      ? `${key}: missing`
      : `${key}: ${issue.message}`;
  });
  throw new EnvError(runtime, issues);
}
