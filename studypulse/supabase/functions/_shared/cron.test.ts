import { assertThrows } from "@std/assert";

import { requireCron } from "./cron.ts";

const baseEnv = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

Deno.test("requireCron accepts only the configured secret", () => {
  for (const [k, v] of Object.entries({ ...baseEnv, CRON_SECRET: "s3cret-value" }))
    Deno.env.set(k, v);
  const req = (secret?: string) =>
    new Request("http://localhost/", {
      method: "POST",
      headers: secret ? { "x-cron-secret": secret } : {},
    });
  requireCron(req("s3cret-value"));
  assertThrows(() => requireCron(req("s3cret-valuX")));
  assertThrows(() => requireCron(req("s3cret")));
  assertThrows(() => requireCron(req()));
});
