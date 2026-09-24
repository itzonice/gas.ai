// Server-only: never import this from a client component.
import { parseEnv, webServerEnvSchema } from "@studypulse/core/env";

let cached: ReturnType<typeof load> | undefined;

function load() {
  return parseEnv("web (server)", webServerEnvSchema, process.env);
}

/** Validated server env. Parsed lazily so `next build` works without runtime secrets. */
export function serverEnv() {
  cached ??= load();
  return cached;
}
