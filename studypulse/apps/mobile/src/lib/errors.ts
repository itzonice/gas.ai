import { ApiError } from "@studypulse/core/api";

/** A sentence to show for a failed call: the server's field messages if it sent any. */
export function errorMessage(e: unknown, fallback = "Something went wrong. Try again."): string {
  if (e instanceof ApiError && e.issues.length) return e.issues.map((i) => i.message).join(" ");
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
