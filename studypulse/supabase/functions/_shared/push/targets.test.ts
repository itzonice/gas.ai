import { assertEquals } from "jsr:@std/assert@^1";

import { deliveryTargets, type Token } from "./targets.ts";

const vapid = { publicKey: "pub", privateKey: "priv", subject: "mailto:a@b.c" };
const expo: Token = {
  id: "e1",
  user_id: "u",
  token: "ExponentPushToken[x]",
  provider: "expo",
  web_push_keys: null,
};
const web: Token = {
  id: "w1",
  user_id: "u",
  token: "https://push.example/1",
  provider: "web_push",
  web_push_keys: { p256dh: "k", auth: "a" },
};

Deno.test("expo devices win over web push", () => {
  const t = deliveryTargets([expo, web], vapid);
  assertEquals(
    t.expo.map((x) => x.id),
    ["e1"],
  );
  assertEquals(t.web, []);
});

Deno.test("web-only users get web push when it's configured", () => {
  assertEquals(deliveryTargets([web], vapid).web, [
    { tokenId: "w1", subscription: { endpoint: "https://push.example/1", p256dh: "k", auth: "a" } },
  ]);
});

Deno.test("with web push off, web tokens are skipped and Expo still goes out", () => {
  assertEquals(deliveryTargets([web], null), { expo: [], web: [] });
  assertEquals(
    deliveryTargets([expo, web], null).expo.map((x) => x.id),
    ["e1"],
  );
});
