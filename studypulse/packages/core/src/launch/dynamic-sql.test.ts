// Launch safety S34: migrations never build SQL from pasted strings either. (SQL test 690
// checks the functions in the database; this checks one-off DO blocks in migrations.)
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const dir = fileURLToPath(new URL("../../../../supabase/migrations", import.meta.url));

/**
 * Applied migrations that format a constant list of function signatures, written in the
 * migration itself, with %s (a signature can't be quoted with %I). They run once at
 * deploy and take no input. Applied migrations are never edited (CLAUDE.md rule 6).
 */
const REVIEWED = new Set(["20260924003500_canvas_oauth.sql", "20260924004400_google_calendar.sql"]);

describe("dynamic SQL in migrations (S34)", () => {
  it("uses format() with %I and %L, never || concatenation or unquoted %s", () => {
    const findings: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const sql = readFileSync(join(dir, file), "utf8");
      for (const m of sql.matchAll(/\bexecute\b([^;]*);/gi)) {
        const stmt = m[1] ?? "";
        if (/^\s+(?:on|function|procedure)\b/i.test(stmt)) continue; // GRANT/REVOKE EXECUTE ON …
        if (stmt.includes("||")) findings.push(`${file}: concatenation in EXECUTE`);
        if (/format\s*\(/i.test(stmt) && stmt.includes("%s") && !REVIEWED.has(file)) {
          findings.push(`${file}: unquoted %s in EXECUTE format()`);
        }
      }
    }
    expect(findings).toEqual([]);
  });
});
