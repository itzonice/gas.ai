// Provider calls from edge functions go through providerFetch (launch safety S9): bounded
// retries with jittered backoff, and a circuit breaker per provider whose "open until" is
// shared with every other worker through private.provider_circuits.
import { createLogger } from "@studypulse/core/observability/index.ts";
import {
  type Breaker,
  breakerFor,
  type Provider,
  resilientFetch,
  type ResilientFetchOptions,
} from "@studypulse/core/resilience/index.ts";

import { runInBackground } from "./background.ts";
import { adminClient } from "./supabase.ts";

/** How often a worker re-reads the shared breaker state. */
const SYNC_MS = 30_000;
let lastSync = 0;

const log = createLogger({ requestId: "provider-breaker", fields: { component: "resilience" } });

async function syncShared(): Promise<void> {
  if (Date.now() - lastSync < SYNC_MS) return;
  lastSync = Date.now();
  try {
    const { data, error } = await adminClient().rpc("provider_circuits_open");
    if (error) throw error;
    for (const row of data ?? []) {
      breakerFor(row.provider as Provider, { onOpen }).openUntilAtLeast(Date.parse(row.open_until));
    }
  } catch (error) {
    // The shared state is an optimisation; without it each worker still has its own breaker.
    log.warn("could not read shared provider breakers", { error });
  }
}

function onOpen(provider: Provider, until: number): void {
  log.warn("provider breaker opened", { provider, until: new Date(until).toISOString() });
  runInBackground(
    Promise.resolve(
      adminClient().rpc("open_provider_circuit", {
        p_provider: provider,
        p_until: new Date(until).toISOString(),
      }),
    ).then(({ error }) => {
      if (error) log.warn("could not share provider breaker", { provider, error });
    }),
  );
}

/** A worker-wide breaker for `provider` that also honours pauses opened by other workers. */
export function providerBreaker(provider: Provider): Breaker {
  const breaker = breakerFor(provider, { onOpen });
  return {
    async check() {
      await syncShared();
      breaker.check();
    },
    success: () => breaker.success(),
    failure: () => breaker.failure(),
    abandon: () => breaker.abandon(),
  };
}

/** `fetch` for calls to `provider`: at most 3 attempts, and fails fast while it's paused. */
export function providerFetch(
  provider: Provider,
  options: Omit<ResilientFetchOptions, "breaker"> = {},
): typeof fetch {
  return resilientFetch(provider, { ...options, breaker: providerBreaker(provider) });
}

/** Test helper. */
export function resetSharedSyncForTests(): void {
  lastSync = 0;
}
