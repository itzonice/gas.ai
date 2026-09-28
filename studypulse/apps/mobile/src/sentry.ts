import * as Sentry from "@sentry/react-native";
import { appEnvSchema } from "@studypulse/core/env";
import { scrubEvent, sentryBaseOptions } from "@studypulse/core/observability";

// Independent of the full env schema so a missing variable is still reported.
Sentry.init({
  ...sentryBaseOptions(
    process.env.EXPO_PUBLIC_SENTRY_DSN || undefined,
    appEnvSchema.catch("development").parse(process.env.EXPO_PUBLIC_APP_ENV),
  ),
  beforeSend: scrubEvent,
});

export { Sentry };
