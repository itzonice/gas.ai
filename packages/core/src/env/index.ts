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
