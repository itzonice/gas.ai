import type { ExpoClientOptions, VapidKeys } from "@studypulse/core/notify/index.ts";

import { env } from "../env.ts";

import { providerFetch } from "../resilience.ts";

/** Expo client options from the environment (access token, API override). */
export function expoOptions(): ExpoClientOptions {
  const e = env();
  return {
    ...(e.EXPO_ACCESS_TOKEN ? { accessToken: e.EXPO_ACCESS_TOKEN } : {}),
    ...(e.EXPO_API_URL ? { baseUrl: e.EXPO_API_URL } : {}),
    // Reading receipts is safe to repeat; sending a push is only repeated when Expo
    // says it didn't take it (429/503), so nobody gets a reminder twice.
    fetch: providerFetch("expo", { idempotent: (url) => url.includes("/getReceipts") }),
  };
}

/** VAPID keys for web push, or null when web push isn't configured. */
export function vapidKeys(): VapidKeys | null {
  const e = env();
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY || !e.VAPID_SUBJECT) return null;
  return {
    publicKey: e.VAPID_PUBLIC_KEY,
    privateKey: e.VAPID_PRIVATE_KEY,
    subject: e.VAPID_SUBJECT,
  };
}
