// pnpm deploy:check - which features this environment can turn on, and what's missing.
// Reads the shell environment plus supabase/functions/.env and apps/web/.env.local
// (the files `pnpm local` writes). Prints values for nothing; only variable names.
// Exit code 0; with --strict, 1 if anything the app uses at runtime is off.
import { existsSync, readFileSync } from "node:fs";

import { FEATURES, featureStatus, type FeatureName } from "../src/env/features.ts";

const root = new URL("../../../", import.meta.url);

function readEnvFile(path: string): Record<string, string> {
  const file = new URL(path, root);
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m?.[1]) out[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
  }
  return out;
}

const env: Record<string, string | undefined> = {
  ...readEnvFile("supabase/functions/.env"),
  ...readEnvFile("apps/web/.env.local"),
  ...process.env,
};
const status = featureStatus(env);
const names = Object.keys(FEATURES) as FeatureName[];
const width = Math.max(...names.map((n) => FEATURES[n].label.length));

console.log("Feature".padEnd(width + 2) + "Status  Missing");
for (const name of names) {
  const s = status[name];
  const spec = FEATURES[name];
  console.log(
    `${spec.label.padEnd(width + 2)}${s.enabled ? "on    " : "off   "}  ${s.missing.join(", ") || "-"}`,
  );
}
const off = names.filter((n) => !status[n].enabled);
if (off.length) {
  console.log("\nWhile off:");
  for (const n of off) console.log(`  ${FEATURES[n].label}: ${FEATURES[n].whenOff}`);
}
if (process.argv.includes("--strict") && off.some((n) => !FEATURES[n].deployOnly)) process.exit(1);
