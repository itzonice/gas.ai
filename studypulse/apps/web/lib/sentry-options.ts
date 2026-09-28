import { appEnvSchema } from "@studypulse/core/env";
import { scrubEvent, sentryBaseOptions } from "@studypulse/core/observability";

// Deliberately independent of the full env schema: error reporting must still
// initialize when some other variable is missing, so that failure gets reported.
export const sentryOptions = {
  ...sentryBaseOptions(
    process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    appEnvSchema.catch("development").parse(process.env.NEXT_PUBLIC_APP_ENV),
  ),
  beforeSend: scrubEvent,
};
