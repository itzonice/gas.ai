import { edgeEnvSchema, parseEnv, type EdgeEnv } from "@studypulse/core/env/index.ts";

let cached: EdgeEnv | undefined;

/** Validated edge-function env, parsed once per isolate. */
export function env(): EdgeEnv {
  cached ??= parseEnv("edge", edgeEnvSchema, Deno.env.toObject());
  return cached;
}

/** Tests only: re-read Deno.env on the next env() call. */
export function resetEnvForTests(): void {
  cached = undefined;
}
