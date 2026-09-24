import "./edge-runtime.d.ts";

/** Runs work after the response is returned. Falls back to fire-and-forget outside Supabase. */
export function runInBackground(promise: Promise<unknown>): void {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime) {
    EdgeRuntime.waitUntil(promise);
  } else {
    promise.catch(() => {});
  }
}
