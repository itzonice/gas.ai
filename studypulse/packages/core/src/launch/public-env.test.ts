// Launch safety S3: only public values may use the NEXT_PUBLIC_ / EXPO_PUBLIC_ prefixes,
// because Next.js and Expo inline those into client bundles. (CI also builds both apps
// with canary secrets and scans the bundles: scripts/secret-scan.mjs.)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { mobileEnvSchema, webPublicEnvSchema } from "../env/index.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));

/** Every client-visible variable, and why it's safe to ship. */
const ALLOWED_PUBLIC = {
  NEXT_PUBLIC_APP_ENV: "environment name",
  NEXT_PUBLIC_SUPABASE_URL: "project URL",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon key; RLS decides what it can read",
  NEXT_PUBLIC_SENTRY_DSN: "DSN is a public ingest address",
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "the public half of the VAPID pair",
  NEXT_PUBLIC_SUPPORT_EMAIL: "the published support address",
  NEXT_PUBLIC_COMPANY_LEGAL_NAME: "the published business name",
  NEXT_PUBLIC_COMPANY_ADDRESS: "the published mailing address",
  EXPO_PUBLIC_APP_ENV: "environment name",
  EXPO_PUBLIC_SUPABASE_URL: "project URL",
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon key; RLS decides what it can read",
  EXPO_PUBLIC_SENTRY_DSN: "DSN is a public ingest address",
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: "RevenueCat public SDK key",
  EXPO_PUBLIC_REVENUECAT_ANDROID_KEY: "RevenueCat public SDK key",
  EXPO_PUBLIC_WEB_URL: "web app origin",
  EXPO_PUBLIC_SUPPORT_EMAIL: "the published support address",
  EXPO_PUBLIC_COMPANY_LEGAL_NAME: "the published business name",
  EXPO_PUBLIC_COMPANY_ADDRESS: "the published mailing address",
} as const;

const SECRET_LOOKING = /SECRET|SERVICE_ROLE|PRIVATE|PASSWORD|TOKEN|WEBHOOK|ANTHROPIC|STRIPE|RESEND/;

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".") || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(?:[cm]?[jt]sx?|json)$/.test(entry) || entry.startsWith(".env")) yield path;
  }
}

describe("client-visible environment variables", () => {
  it("allowlist entries don't look like secrets", () => {
    for (const name of Object.keys(ALLOWED_PUBLIC)) {
      expect(name.replace(/^(NEXT|EXPO)_PUBLIC_/, "")).not.toMatch(SECRET_LOOKING);
    }
  });

  it("the web and mobile env schemas only declare allowlisted public variables", () => {
    const declared = [
      ...Object.keys(webPublicEnvSchema.shape),
      ...Object.keys(mobileEnvSchema.shape),
    ];
    expect(declared.filter((k) => !(k in ALLOWED_PUBLIC))).toEqual([]);
  });

  it("no source file or env example uses a public prefix for anything else", () => {
    const found = new Map<string, string>();
    const dirs = ["apps/web", "apps/mobile", "packages"].map((d) => join(root, d));
    for (const dir of dirs) {
      for (const file of sourceFiles(dir)) {
        for (const m of readFileSync(file, "utf8").matchAll(/\b(?:NEXT|EXPO)_PUBLIC_[A-Z0-9_]+/g)) {
          found.set(m[0], file.slice(root.length));
        }
      }
    }
    for (const m of readFileSync(join(root, ".env.example"), "utf8").matchAll(
      /^((?:NEXT|EXPO)_PUBLIC_[A-Z0-9_]+)=/gm,
    )) {
      found.set(m[1]!, ".env.example");
    }
    const unexpected = [...found].filter(([name]) => !(name in ALLOWED_PUBLIC));
    expect(unexpected).toEqual([]);
  });
});
