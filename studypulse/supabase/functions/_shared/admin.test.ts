// Launch safety S32: only app_metadata "role": "admin" makes an admin.
import { assertEquals } from "@std/assert";

import { isAdminMetadata } from "./supabase.ts";

Deno.test("only app_metadata role admin is an admin", () => {
  assertEquals(isAdminMetadata({ role: "admin", provider: "email" }), true);
  for (const value of [
    undefined,
    null,
    {},
    { role: "Admin" },
    { role: "authenticated" },
    { roles: ["admin"] },
    { is_admin: true },
    "admin",
  ]) {
    assertEquals(isAdminMetadata(value), false, JSON.stringify(value));
  }
});
