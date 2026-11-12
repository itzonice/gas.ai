// Launch safety S33: nothing meant for development or tests reaches production. Debug
// routes, seed data, and test helpers stay out of migrations, functions, and web routes;
// the API exposes only the public schema; source maps go to Sentry, not to browsers.
// (Test-only environment variables are refused in production by the env schema.)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (p: string) => readFileSync(join(root, p), "utf8");

function* dirs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next"].includes(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield path;
      yield* dirs(path);
    }
  }
}

const DEV_NAME = /(?:^|[/-])(?:debug|seed|test|tests|dev|playground|sandbox)(?:$|[/-])/i;

describe("production surface (S33)", () => {
  it("migrations never create test helpers or demo data", () => {
    const dir = join(root, "supabase/migrations");
    const offenders = readdirSync(dir).filter((f) => {
      const sql = readFileSync(join(dir, f), "utf8");
      return (
        /\bschema\s+(?:if\s+not\s+exists\s+)?tests\b|\btests\.\w+\(/i.test(sql) ||
        /insert\s+into\s+auth\.users/i.test(sql)
      );
    });
    expect(offenders).toEqual([]);
  });

  it("no edge function or web route is a debug, seed, or test endpoint", () => {
    const functions = readdirSync(join(root, "supabase/functions")).filter((f) => DEV_NAME.test(f));
    const routes = [...dirs(join(root, "apps/web/app"))]
      .map((p) => p.slice(join(root, "apps/web/app").length))
      .filter((p) => DEV_NAME.test(p.replace(/\([^)]*\)/g, "")));
    expect({ functions, routes }).toEqual({ functions: [], routes: [] });
  });

  it("the component gallery returns 404 in production builds", () => {
    expect(read("apps/web/app/(app)/design/page.tsx")).toMatch(
      /process\.env\.NODE_ENV === "production"\) notFound\(\)/,
    );
  });

  it("the API exposes only the public schema", () => {
    const api = /\[api\][\s\S]*?\nschemas = (\[[^\]]*\])/.exec(read("supabase/config.toml"));
    expect(JSON.parse(api?.[1] ?? "null")).toEqual(["public"]);
  });

  it("source maps are uploaded to Sentry and never served", () => {
    const config = read("apps/web/next.config.ts");
    expect(config).toContain("deleteSourcemapsAfterUpload: true");
    expect(config).not.toMatch(/productionBrowserSourceMaps:\s*true/);
  });
});
