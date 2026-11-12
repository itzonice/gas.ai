// Dependency advisories (launch safety S29). Fails when Next.js (or React, which it ships
// with) has any published advisory for the installed version, or when any production
// dependency has a high or critical one. Upgrade with `pnpm up <package>` and re-run.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ALWAYS_BLOCK = new Set(["next", "react", "react-dom", "@supabase/ssr"]);
const BLOCKING_SEVERITY = new Set(["high", "critical"]);

let out;
try {
  out = execFileSync("pnpm", ["audit", "--prod", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (error) {
  // pnpm audit exits non-zero when it finds anything; the JSON is still on stdout.
  out = error.stdout;
  if (!out) {
    console.error("deps:audit: couldn't reach the npm advisory database");
    throw error;
  }
}

const advisories = Object.values(JSON.parse(out).advisories ?? {});
const blocking = advisories.filter(
  (a) => ALWAYS_BLOCK.has(a.module_name) || BLOCKING_SEVERITY.has(a.severity),
);
for (const a of advisories) {
  const mark = blocking.includes(a) ? "BLOCKING" : "note";
  console.log(`${mark}: ${a.severity} ${a.module_name} ${a.vulnerable_versions}: ${a.title}`);
}
if (blocking.length > 0) {
  console.error(
    `deps:audit: ${String(blocking.length)} blocking advisories; upgrade before merging.`,
  );
  process.exit(1);
}
console.log(
  `deps:audit: no advisories for Next.js or React, and nothing high or critical (${String(advisories.length)} lower-severity notes).`,
);
