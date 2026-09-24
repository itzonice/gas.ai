import { parseEnv, webPublicEnvSchema } from "@studypulse/core/env";

// Next.js only inlines NEXT_PUBLIC_* vars that are referenced literally, so list them here.
export const publicEnv = parseEnv("web (public)", webPublicEnvSchema, {
  NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});
