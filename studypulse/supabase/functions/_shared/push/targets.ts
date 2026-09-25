import type { VapidKeys, WebPushSubscription } from "@studypulse/core/notify/index.ts";
import { z } from "zod";

const webPushKeysSchema = z.object({ p256dh: z.string(), auth: z.string() });

export interface Token {
  id: string;
  user_id: string;
  token: string;
  provider: "expo" | "web_push";
  web_push_keys: unknown;
}

/**
 * Where a user's reminders go: their Expo devices if they have any, otherwise their web
 * push subscriptions (the fallback). With web push off (vapid null), web-only users get
 * no push from this job; the email digest covers them when it's configured.
 */
export function deliveryTargets(tokens: readonly Token[], vapid: VapidKeys | null) {
  const expo = tokens.filter((t) => t.provider === "expo");
  const web: { tokenId: string; subscription: WebPushSubscription }[] = [];
  if (!expo.length && vapid) {
    for (const t of tokens.filter((x) => x.provider === "web_push")) {
      const keys = webPushKeysSchema.safeParse(t.web_push_keys);
      if (keys.success)
        web.push({ tokenId: t.id, subscription: { endpoint: t.token, ...keys.data } });
    }
  }
  return { expo, web };
}
