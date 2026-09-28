// Browser glue for web push: registers the service worker, subscribes with the VAPID
// public key, and stores the subscription through the API. Sending is server-side
// (send-reminders), which uses web push only for users with no mobile device.
import type { ApiClient } from "@studypulse/core/api";

import { publicEnv } from "./env";

export function webPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    Boolean(publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
  );
}

function decodeKey(base64Url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function encodeKey(key: ArrayBuffer | null): string {
  if (!key) throw new Error("push subscription is missing its keys");
  return btoa(String.fromCharCode(...new Uint8Array(key)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Asks for permission (call from a user gesture), subscribes, and registers the
 * subscription. Returns false if the browser can't or the user declined.
 */
export async function enableWebPush(api: ApiClient): Promise<boolean> {
  const vapidKey = publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!webPushSupported() || !vapidKey) return false;
  if ((await Notification.requestPermission()) !== "granted") return false;

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(vapidKey),
    }));

  await api.notifications.registerPushToken({
    provider: "web_push",
    token: subscription.endpoint,
    platform: "web",
    webPushKeys: {
      p256dh: encodeKey(subscription.getKey("p256dh")),
      auth: encodeKey(subscription.getKey("auth")),
    },
  });
  return true;
}

/** Unsubscribes this browser and removes it server-side (call on sign-out). */
export async function disableWebPush(api: ApiClient): Promise<void> {
  if (!webPushSupported()) return;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await api.notifications.unregisterPushToken("web_push", subscription.endpoint);
  await subscription.unsubscribe();
}
