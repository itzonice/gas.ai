// S21: the app and the database must agree on the Terms version users accept.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { TERMS_VERSION } from "../legal/index.ts";

it("private.current_terms_version() returns TERMS_VERSION", () => {
  const dir = fileURLToPath(new URL("../../../../supabase/migrations/", import.meta.url));
  const latest = readdirSync(dir)
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .filter((sql) => sql.includes("function private.current_terms_version()"))
    .at(-1);
  expect(latest).toBeDefined();
  expect(latest).toContain(`select '${TERMS_VERSION}'::text`);
});
