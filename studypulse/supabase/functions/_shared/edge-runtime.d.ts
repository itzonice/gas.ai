// Supabase Edge Runtime global: keeps the isolate alive for background work after
// the response is sent.
declare global {
  const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void } | undefined;
}

export {};
