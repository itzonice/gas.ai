// Owner alerts: Sentry (warning) plus the ALERT_WEBHOOK_URL chat webhook when set.
import type { Logger } from "@studypulse/core/observability/index.ts";

import { env } from "./env.ts";
import { Sentry } from "./sentry.ts";

export async function alertOwner(
  kind: string,
  text: string,
  log: Logger,
  context: Record<string, unknown> = {},
): Promise<void> {
  log.warn(`owner alert: ${kind}`, context);
  Sentry.withScope((scope) => {
    scope.setTag("alert", kind);
    scope.setContext(kind, context);
    Sentry.captureMessage(text, "warning");
  });
  const url = env().ALERT_WEBHOOK_URL;
  if (url) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `:rotating_light: StudyPulse ${kind}\n${text}` }),
    }).catch((error: unknown) => {
      log.error("alert webhook failed", { error });
      return null;
    });
    await res?.body?.cancel();
  }
  await Sentry.flush(2000);
}
