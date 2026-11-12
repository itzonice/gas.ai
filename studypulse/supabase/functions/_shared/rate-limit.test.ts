import { assert, assertEquals } from "@std/assert";

import { clientIp, FUNCTION_LIMITS } from "./rate-limit.ts";

Deno.test("every edge function has rate limits", async () => {
  const missing: string[] = [];
  for await (const e of Deno.readDir(new URL("../", import.meta.url))) {
    if (e.isDirectory && !e.name.startsWith("_") && !(e.name in FUNCTION_LIMITS))
      missing.push(e.name);
  }
  assertEquals(missing, [], "add these functions to FUNCTION_LIMITS in _shared/rate-limit.ts");
});

Deno.test("every limit is positive and user-facing functions limit per user", () => {
  for (const [name, l] of Object.entries(FUNCTION_LIMITS)) {
    assert(l.ip.limit > 0 && l.ip.windowSeconds > 0, name);
    if (l.user) assert(l.user.limit > 0 && l.user.windowSeconds > 0, name);
  }
  for (const name of [
    "upload-syllabus",
    "generate-cards",
    "export-data",
    "delete-account",
    "stripe-checkout",
  ]) {
    assert(FUNCTION_LIMITS[name]?.user, `${name} needs a per-user limit`);
  }
});

Deno.test("client IP prefers headers the proxy sets over ones the client can send", () => {
  const req = (h: Record<string, string>) => new Request("http://x/", { headers: h });
  assertEquals(
    clientIp(req({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "9.9.9.9" })),
    "1.1.1.1",
  );
  assertEquals(clientIp(req({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "9.9.9.9" })), "2.2.2.2");
  assertEquals(clientIp(req({ "x-forwarded-for": "3.3.3.3, 10.0.0.1" })), "3.3.3.3");
  assertEquals(clientIp(req({})), "unknown");
});
