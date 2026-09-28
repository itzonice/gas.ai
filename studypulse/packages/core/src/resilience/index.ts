// Bounded retries and circuit breakers for calls to outside providers (launch safety S9).
//
// Every provider client in this package takes an optional `fetch`; the edge functions pass
// `resilientFetch(provider)`, so each HTTP request to a provider:
// - is tried at most 3 times, waiting with exponential backoff and full jitter between tries
//   (or the provider's Retry-After, if that is short);
// - is only retried when repeating it can't cause a second side effect: the request is
//   idempotent (GET/PUT/DELETE, an Idempotency-Key header, or the provider is marked
//   idempotent), or the provider said it didn't process it (408, 429, 503, 529);
// - counts toward the provider's circuit breaker when it finally fails (network error, 5xx,
//   or 429). After 5 failures in a row the breaker opens and every call to that provider
//   fails fast with CircuitOpenError for 5 minutes; then one call is let through to test it.

export const PROVIDERS = ["anthropic", "stripe", "expo", "resend", "google", "posthog"] as const;
export type Provider = (typeof PROVIDERS)[number];

type FetchInput = Parameters<typeof fetch>[0];

export const RETRY_ATTEMPTS = 3;
export const RETRY_BASE_MS = 250;
export const RETRY_MAX_MS = 4_000;
/** A Retry-After longer than this isn't waited out inside a request; the call fails instead. */
export const MAX_RETRY_AFTER_MS = 10_000;
export const BREAKER_THRESHOLD = 5;
export const BREAKER_COOLDOWN_MS = 5 * 60_000;

/** Statuses meaning the provider did not process the request, so repeating it is safe. */
const NOT_PROCESSED = new Set([408, 429, 503, 529]);
/** Statuses worth retrying when the request is idempotent. */
const TRANSIENT = new Set([408, 429, 500, 502, 503, 504, 529]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

/** Delay before retry number `retry` (1-based): uniform in [0, min(max, base · 2^(retry-1))). */
export function backoffMs(
  retry: number,
  random: () => number = Math.random,
  baseMs = RETRY_BASE_MS,
  maxMs = RETRY_MAX_MS,
): number {
  const cap = Math.min(maxMs, baseMs * 2 ** Math.max(0, retry - 1));
  return Math.floor(random() * cap);
}

/** Retry-After in milliseconds (seconds or an HTTP date), or null if absent or invalid. */
export function retryAfterMs(res: Response, now: number = Date.now()): number | null {
  const value = res.headers.get("retry-after");
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

export class CircuitOpenError extends Error {
  readonly provider: Provider;
  readonly retryAt: number;

  constructor(provider: Provider, retryAt: number) {
    super(
      `${provider} is unavailable; not calling it again until ${new Date(retryAt).toISOString()}`,
    );
    this.name = "CircuitOpenError";
    this.provider = provider;
    this.retryAt = retryAt;
  }
  /** Whole seconds until the provider may be called again (for a Retry-After header). */
  retryAfterSeconds(now: number = Date.now()): number {
    return Math.max(1, Math.ceil((this.retryAt - now) / 1000));
  }
}

export interface Breaker {
  /** Throws CircuitOpenError while the provider is off limits. */
  check(): void | Promise<void>;
  success(): void;
  failure(): void;
  /** The call ended without an answer either way (the caller aborted it). */
  abandon(): void;
}

export interface CircuitBreakerOptions {
  threshold?: number;
  cooldownMs?: number;
  now?: () => number;
  /** Called once each time the breaker opens (e.g. to share the state with other workers). */
  onOpen?: (provider: Provider, until: number) => void;
}

/**
 * Consecutive-failure circuit breaker. Closed: calls go through. Open: calls fail fast
 * until the cooldown ends. Then half-open: one trial call goes through; success closes
 * the breaker, failure opens it for another cooldown.
 */
export class CircuitBreaker implements Breaker {
  private failures = 0;
  private openUntil = 0;
  private trialInFlight = false;
  private readonly threshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  readonly provider: Provider;
  private readonly options: CircuitBreakerOptions;

  constructor(provider: Provider, options: CircuitBreakerOptions = {}) {
    this.provider = provider;
    this.options = options;
    this.threshold = options.threshold ?? BREAKER_THRESHOLD;
    this.cooldownMs = options.cooldownMs ?? BREAKER_COOLDOWN_MS;
    this.now = options.now ?? Date.now;
  }

  /** Opened elsewhere (another worker): stay closed to calls until `until`. */
  openUntilAtLeast(until: number): void {
    if (until > this.openUntil) this.openUntil = until;
  }

  get state(): "closed" | "open" | "half-open" {
    if (this.openUntil === 0) return "closed";
    return this.now() < this.openUntil ? "open" : "half-open";
  }

  check(): void {
    const state = this.state;
    if (state === "open") throw new CircuitOpenError(this.provider, this.openUntil);
    if (state === "half-open") {
      if (this.trialInFlight) throw new CircuitOpenError(this.provider, this.now() + 1000);
      this.trialInFlight = true;
    }
  }

  success(): void {
    this.failures = 0;
    this.openUntil = 0;
    this.trialInFlight = false;
  }

  abandon(): void {
    this.trialInFlight = false;
  }

  failure(): void {
    const wasTrial = this.trialInFlight;
    this.trialInFlight = false;
    this.failures++;
    if (wasTrial || this.failures >= this.threshold) {
      this.openUntil = this.now() + this.cooldownMs;
      this.failures = 0;
      this.options.onOpen?.(this.provider, this.openUntil);
    }
  }
}

const registry = new Map<Provider, CircuitBreaker>();

/** The process-wide breaker for a provider (one per worker/isolate). */
export function breakerFor(provider: Provider, options?: CircuitBreakerOptions): CircuitBreaker {
  let b = registry.get(provider);
  if (!b) {
    b = new CircuitBreaker(provider, options);
    registry.set(provider, b);
  }
  return b;
}

/** Test helper: forget every breaker's state. */
export function resetBreakersForTests(): void {
  registry.clear();
}

export interface ResilientFetchOptions {
  fetch?: typeof fetch;
  attempts?: number;
  breaker?: Breaker;
  /** Every request to this provider is safe to repeat (e.g. an AI completion). */
  idempotent?: boolean | ((url: string, init: RequestInit | undefined) => boolean);
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  now?: () => number;
}

function methodOf(input: FetchInput, init?: RequestInit): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function hasIdempotencyKey(input: FetchInput, init?: RequestInit): boolean {
  const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  return h.has("idempotency-key");
}

function urlOf(input: FetchInput): string {
  return input instanceof Request ? input.url : String(input);
}

/** A body that can be sent more than once (streams can't). */
function replayable(input: FetchInput, init?: RequestInit): boolean {
  if (input instanceof Request && init?.body === undefined) return input.body === null;
  const body = init?.body;
  return body === undefined || body === null || !(body instanceof ReadableStream);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `fetch` with bounded retries and the provider's circuit breaker (see the file comment). */
export function resilientFetch(
  provider: Provider,
  options: ResilientFetchOptions = {},
): typeof fetch {
  const doFetch = options.fetch ?? fetch;
  const attempts = Math.max(1, Math.min(options.attempts ?? RETRY_ATTEMPTS, RETRY_ATTEMPTS));
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;

  const wrapped = async (input: FetchInput, init?: RequestInit): Promise<Response> => {
    const breaker = options.breaker ?? breakerFor(provider);
    await breaker.check();
    const idempotent =
      typeof options.idempotent === "function"
        ? options.idempotent(urlOf(input), init)
        : (options.idempotent ?? false) ||
          IDEMPOTENT_METHODS.has(methodOf(input, init)) ||
          hasIdempotencyKey(input, init);
    const maxTries = replayable(input, init) ? attempts : 1;

    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await doFetch(input, init);
      } catch (error) {
        // The caller gave up (timeout or cancel): not the provider's fault, don't retry.
        if (init?.signal?.aborted) {
          breaker.abandon();
          throw error;
        }
        // The request may have reached the provider, so only repeat it if that's harmless.
        if (!idempotent || attempt >= maxTries) {
          breaker.failure();
          throw error;
        }
        await sleep(backoffMs(attempt, random));
        continue;
      }

      if (!TRANSIENT.has(res.status)) {
        breaker.success();
        return res;
      }
      const safe = idempotent || NOT_PROCESSED.has(res.status);
      const after = retryAfterMs(res, now());
      if (safe && attempt < maxTries && (after === null || after <= MAX_RETRY_AFTER_MS)) {
        await res.body?.cancel().catch(() => undefined);
        await sleep(Math.max(after ?? 0, backoffMs(attempt, random)));
        continue;
      }
      if (res.status >= 500 || res.status === 429) breaker.failure();
      else breaker.success();
      return res;
    }
  };
  return wrapped;
}

/** The CircuitOpenError behind `error`, if any (SDKs wrap fetch errors in their own). */
export function circuitOpenCause(error: unknown): CircuitOpenError | null {
  let e: unknown = error;
  for (let depth = 0; depth < 6 && e; depth++) {
    if (e instanceof CircuitOpenError) return e;
    e = e instanceof Error ? e.cause : undefined;
  }
  return null;
}
