import { mobileEnvSchema, parseEnv } from "@studypulse/core/env";

// Expo only inlines EXPO_PUBLIC_* vars that are referenced literally, so list them here.
export const env = parseEnv("mobile", mobileEnvSchema, {
  EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_SENTRY_DSN: process.env.EXPO_PUBLIC_SENTRY_DSN,
});
