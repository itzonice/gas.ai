import * as Sentry from "@sentry/deno";
import { appEnvSchema } from "@studypulse/core/env/index.ts";
import { scrubEvent, sentryBaseOptions } from "@studypulse/core/observability/index.ts";

// Initialized once per isolate. Default integrations are off because one isolate
// serves many requests and the global handlers would mix their scopes together.
const dsn = Deno.env.get("SENTRY_DSN") || undefined;
Sentry.init({
  ...sentryBaseOptions(dsn, appEnvSchema.catch("development").parse(Deno.env.get("APP_ENV"))),
  defaultIntegrations: false,
  beforeSend: scrubEvent,
});
Sentry.setTag("region", Deno.env.get("SB_REGION") ?? "local");
Sentry.setTag("execution_id", Deno.env.get("SB_EXECUTION_ID") ?? "local");

export { Sentry };
