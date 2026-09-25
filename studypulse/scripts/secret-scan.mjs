// Client bundle secret scan (launch safety S3).
//
//   node scripts/secret-scan.mjs --build   # build web + mobile with canary secrets, then scan
//   node scripts/secret-scan.mjs <dir>...  # scan existing build output
//
// Only the Supabase anon key and public ids may ship to browsers and phones. With
// --build, every server-only variable is set to a unique canary value before building
// the web app (next build) and the mobile app (expo export for iOS and Android); then
// every file a client downloads is searched for those canaries and for the shapes of
// real secrets (service-role JWTs, Stripe secret keys and webhook secrets, Anthropic
// keys). Any hit fails the run and names the file and what it found.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

/** Server-only variables. None of these may ever reach a client bundle. */
export const SERVER_SECRETS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "REVENUECAT_WEBHOOK_AUTH",
  "RESEND_API_KEY",
  "EMAIL_UNSUBSCRIBE_SECRET",
  "VAPID_PRIVATE_KEY",
  "GOOGLE_CLIENT_SECRET",
  "CRON_SECRET",
  "POSTHOG_API_KEY",
  "EXPO_ACCESS_TOKEN",
  "ALERT_WEBHOOK_URL",
  "SENTRY_AUTH_TOKEN",
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "VERCEL_TOKEN",
];

const canary = (name) => `canary_${name.toLowerCase()}_7c1e9a`;

/** Shapes of real secrets, in case one was pasted into client code directly. */
const PATTERNS = [
  { name: "Stripe secret key", re: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/g },
  { name: "Stripe webhook secret", re: /\bwhsec_[A-Za-z0-9]{10,}/g },
  { name: "Anthropic API key", re: /\bsk-ant-[A-Za-z0-9_-]{10,}/g },
];

// A JWT whose payload says role service_role (the Supabase service key).
const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
function isServiceRoleJwt(payload) {
  try {
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return json.role === "service_role";
  } catch {
    return false;
  }
}

const SCANNED = /\.(?:m?js|cjs|html|json|map|css|txt|hbc|bundle)$/;

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) yield* files(path);
    else if (SCANNED.test(entry)) yield path;
  }
}

export function scan(dirs) {
  const findings = [];
  const canaries = SERVER_SECRETS.map((name) => [name, canary(name)]);
  for (const dir of dirs) {
    if (!existsSync(dir)) {
      findings.push({ file: dir, what: "build output missing (did the build run?)" });
      continue;
    }
    for (const file of files(dir)) {
      const text = readFileSync(file, "latin1");
      const where = relative(root, file);
      for (const [name, value] of canaries) {
        if (text.includes(value)) findings.push({ file: where, what: `${name} (canary value)` });
      }
      for (const { name, re } of PATTERNS) {
        if (re.test(text)) findings.push({ file: where, what: name });
        re.lastIndex = 0;
      }
      for (const m of text.matchAll(JWT)) {
        if (isServiceRoleJwt(m[1]))
          findings.push({ file: where, what: "Supabase service-role JWT" });
      }
    }
  }
  return findings;
}

function build() {
  // Public values a real build would have; the anon key is public by design.
  const env = {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    EXPO_PUBLIC_SUPABASE_ANON_KEY: "public-anon-key",
    NEXT_TELEMETRY_DISABLED: "1",
    EXPO_NO_TELEMETRY: "1",
    CI: "1",
    ...Object.fromEntries(SERVER_SECRETS.map((name) => [name, canary(name)])),
  };
  const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, env, stdio: "inherit" });
  run("pnpm", ["exec", "next", "build"], join(root, "apps/web"));
  const out = join(root, "apps/mobile/dist-secret-scan");
  rmSync(out, { recursive: true, force: true });
  for (const platform of ["ios", "android"]) {
    run(
      "pnpm",
      ["exec", "expo", "export", "--platform", platform, "--output-dir", join(out, platform)],
      join(root, "apps/mobile"),
    );
  }
  // What browsers download: .next/static (and prerendered HTML); all of the mobile export.
  return [join(root, "apps/web/.next/static"), join(root, "apps/web/.next/server/app"), out];
}

const args = process.argv.slice(2);
if (import.meta.url === `file://${process.argv[1]}`) {
  const dirs = args[0] === "--build" ? build() : args.map((d) => join(process.cwd(), d));
  if (dirs.length === 0) {
    console.error("usage: node scripts/secret-scan.mjs --build | <dir>...");
    process.exit(2);
  }
  // Prerendered server HTML is sent to browsers; server-only route code in the same
  // folder is scanned too, which is stricter than needed but catches inlined values.
  const findings = scan(dirs);
  if (findings.length) {
    console.error(`Secret scan: ${findings.length} finding(s) in client bundles:`);
    for (const f of findings) console.error(`  ${f.file}: ${f.what}`);
    process.exit(1);
  }
  console.log(
    `Secret scan: no server secrets in ${dirs.map((d) => relative(root, d)).join(", ")}.`,
  );
}
