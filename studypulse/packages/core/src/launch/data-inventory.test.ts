// S25: every table in the schema is in the data inventory (packages/core/src/privacy).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

import { DATA_INVENTORY } from "../privacy/index.ts";

it("every table created by a migration has a data-inventory entry", () => {
  const dir = fileURLToPath(new URL("../../../../supabase/migrations/", import.meta.url));
  const created = new Set<string>();
  const dropped = new Set<string>();
  for (const file of readdirSync(dir).sort()) {
    const sql = readFileSync(join(dir, file), "utf8");
    for (const m of sql.matchAll(/create table (?:if not exists )?((?:public|private)\.\w+)/gi)) {
      created.add(m[1]!.toLowerCase());
    }
    for (const m of sql.matchAll(/drop table (?:if exists )?((?:public|private)\.\w+)/gi)) {
      dropped.add(m[1]!.toLowerCase());
    }
  }
  const tables = [...created].filter((t) => !dropped.has(t)).sort();
  const missing = tables.filter((t) => !(t in DATA_INVENTORY));
  expect(missing).toEqual([]);
  const stale = Object.keys(DATA_INVENTORY).filter((t) => !tables.includes(t));
  expect(stale).toEqual([]);
});
