// PostHog capture (batch API), used by the flush-analytics function to send the
// analytics_events outbox. fetch-based; runs in edge functions and Node tests.
import { z } from "zod";

export const POSTHOG_DEFAULT_HOST = "https://us.i.posthog.com";
export const POSTHOG_BATCH_SIZE = 500;

export const analyticsEventNames = [
  "signed_up",
  "syllabus_parsed",
  "course_committed",
  "session_logged",
  "upgraded",
  "activated",
] as const;
export type AnalyticsEventName = (typeof analyticsEventNames)[number];

export const outboxEventSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  event: z.enum(analyticsEventNames),
  properties: z.record(z.string(), z.unknown()),
  occurred_at: z.string(),
});
export type OutboxEvent = z.infer<typeof outboxEventSchema>;

export interface PostHogOptions {
  apiKey: string;
  host?: string;
  fetch?: typeof fetch;
  /** Sent as a property so dev and staging events can be filtered out. */
  environment?: string;
}

export class PostHogError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`PostHog ${String(status)}: ${message}`);
    this.name = "PostHogError";
    this.status = status;
  }
}

/** The PostHog batch item for an outbox row. The row id is the event uuid (dedupe). */
export function toPostHogEvent(e: OutboxEvent, environment?: string) {
  return {
    event: e.event,
    distinct_id: e.user_id,
    uuid: e.id,
    timestamp: new Date(e.occurred_at).toISOString(),
    properties: {
      ...e.properties,
      $lib: "studypulse-server",
      ...(environment ? { environment } : {}),
      // Data minimization (S25): no IP address and no GeoIP lookup. The request comes
      // from our server, so PostHog would otherwise record the server's IP as the user's.
      $ip: null,
      $geoip_disable: true,
    },
  };
}

/** Sends up to POSTHOG_BATCH_SIZE events in one request. Throws PostHogError on failure. */
export async function sendPostHogBatch(
  events: readonly OutboxEvent[],
  options: PostHogOptions,
): Promise<void> {
  if (!events.length) return;
  if (events.length > POSTHOG_BATCH_SIZE) {
    throw new Error(`at most ${String(POSTHOG_BATCH_SIZE)} events per batch`);
  }
  const host = (options.host ?? POSTHOG_DEFAULT_HOST).replace(/\/+$/, "");
  const res = await (options.fetch ?? fetch)(`${host}/batch/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: options.apiKey,
      historical_migration: false,
      batch: events.map((e) => toPostHogEvent(e, options.environment)),
    }),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) throw new PostHogError(res.status, text.slice(0, 200) || res.statusText);
}
