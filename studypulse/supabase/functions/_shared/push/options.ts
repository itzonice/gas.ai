import type { ExpoClientOptions } from "@studypulse/core/notify/index.ts";

import { env } from "../env.ts";

/** Expo client options from the environment (access token, API override). */
export function expoOptions(): ExpoClientOptions {
  const e = env();
  return {
    ...(e.EXPO_ACCESS_TOKEN ? { accessToken: e.EXPO_ACCESS_TOKEN } : {}),
    ...(e.EXPO_API_URL ? { baseUrl: e.EXPO_API_URL } : {}),
  };
}
