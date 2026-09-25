// Fixes F10 and F12: with billing or Google keys unset, their helpers fail with a clear
// 503 "not configured" error (which createHandler turns into a JSON response), instead of
// throwing on a missing variable.
import { assertEquals, assertThrows } from "@std/assert";

import { appUrl, stripeOptions } from "./billing.ts";
import { resetEnvForTests } from "./env.ts";
import { googleConfig, requireGoogleConfig } from "./gcal.ts";
import { createHandler } from "./handler.ts";
import { HttpError } from "./http.ts";

const OPTIONAL = [
  "STRIPE_SECRET_KEY",
  "STRIPE_PRICE_MONTHLY",
  "STRIPE_PRICE_YEARLY",
  "STRIPE_WEBHOOK_SECRET",
  "REVENUECAT_WEBHOOK_AUTH",
  "APP_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

function withBareEnv(fn: () => void | Promise<void>) {
  return async () => {
    const saved = Object.fromEntries(OPTIONAL.map((k) => [k, Deno.env.get(k)]));
    Deno.env.set("SUPABASE_URL", Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321");
    Deno.env.set("SUPABASE_ANON_KEY", Deno.env.get("SUPABASE_ANON_KEY") ?? "anon");
    Deno.env.set(
      "SUPABASE_SERVICE_ROLE_KEY",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "service",
    );
    for (const k of OPTIONAL) Deno.env.delete(k);
    resetEnvForTests();
    try {
      await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) if (v !== undefined) Deno.env.set(k, v);
      resetEnvForTests();
    }
  };
}

function assertNotConfigured(fn: () => unknown, code: string) {
  const error = assertThrows(fn, HttpError);
  assertEquals([error.status, error.code], [503, code]);
}

Deno.test(
  "billing helpers say billing isn't configured",
  withBareEnv(() => {
    assertNotConfigured(stripeOptions, "billing_not_configured");
    assertNotConfigured(appUrl, "billing_not_configured");
  }),
);

Deno.test(
  "Google Calendar is off without its keys",
  withBareEnv(() => {
    assertEquals(googleConfig(), null);
    assertNotConfigured(requireGoogleConfig, "google_not_configured");
  }),
);

Deno.test(
  "the handler turns a not-configured error into a 503 JSON response",
  withBareEnv(async () => {
    const original = { log: console.log, warn: console.warn, error: console.error };
    console.log = console.warn = console.error = () => {};
    try {
      const handler = createHandler("test-fn", () => {
        stripeOptions();
        return Response.json({ ok: true });
      });
      const res = await handler(new Request("http://localhost/test-fn", { method: "POST" }));
      assertEquals(res.status, 503);
      const body = (await res.json()) as { error: string };
      assertEquals(body.error, "billing_not_configured");
    } finally {
      Object.assign(console, original);
    }
  }),
);
