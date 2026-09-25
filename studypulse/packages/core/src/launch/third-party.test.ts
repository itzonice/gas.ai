// Launch safety S13–S14: nothing in the apps talks to a third party before consent. No
// hosted fonts, no client-side analytics or trackers, no session replay. The a11y audit
// (apps/web/scripts/a11y-audit.mjs) also records every outside request a real browser
// makes on every screen and fails on any.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { sentryBaseOptions } from "../observability/index.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const SKIP = new Set(["node_modules", ".next", ".turbo", "dist", "dist-secret-scan", ".expo"]);

function* sources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (/\.(tsx?|mjs|jsx?|css|html|json)$/.test(entry) && !entry.endsWith(".test.ts"))
      yield path;
  }
}

const appFiles = [...sources(join(root, "apps/web")), ...sources(join(root, "apps/mobile"))];

/** Hosts and SDKs that would send data somewhere before the user agreed to it. */
const FORBIDDEN = [
  { what: "Google Fonts", re: /fonts\.(googleapis|gstatic)\.com/ },
  {
    what: "Google Analytics / Tag Manager",
    re: /googletagmanager\.com|google-analytics\.com|gtag\(/,
  },
  { what: "client-side PostHog", re: /posthog-js|posthog-react-native/ },
  {
    what: "session replay",
    re: /replayIntegration|mobileReplayIntegration|session_recording|rrweb/,
  },
  { what: "third-party font loader", re: /next\/font\/google|@expo-google-fonts/ },
];

describe("no third-party requests before consent", () => {
  it("apps load no hosted fonts, trackers, client analytics, or session replay", () => {
    const hits: string[] = [];
    for (const file of appFiles) {
      const text = readFileSync(file, "utf8");
      for (const { what, re } of FORBIDDEN) {
        if (re.test(text)) hits.push(`${file.slice(root.length)}: ${what}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it("the web CSP only allows fonts and connections to our own origin and Supabase", () => {
    const config = readFileSync(join(root, "apps/web/next.config.ts"), "utf8");
    expect(config).toContain(`"font-src 'self' data:"`);
    expect(config).toContain("`connect-src 'self' ${supabaseUrl} ${supabaseWs}`");
    expect(config).toContain('tunnelRoute: "/monitoring"');
  });

  it("session replay is off in every Sentry SDK", () => {
    const o = sentryBaseOptions("https://k@o0.ingest.sentry.io/1", "production");
    expect(o.replaysSessionSampleRate).toBe(0);
    expect(o.replaysOnErrorSampleRate).toBe(0);
    expect(o.sendDefaultPii).toBe(false);
  });
});
