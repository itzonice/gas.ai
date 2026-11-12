// App Store review guardrails (launch safety S1, S2) checked on every CI run.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const read = (path: string) => readFileSync(`${root}${path}`, "utf8");

/** Which [auth.external.<provider>] sections of supabase/config.toml are enabled. */
function enabledProviders(toml: string): string[] {
  const enabled: string[] = [];
  const sections = toml.split(/^\[/m);
  for (const section of sections) {
    const name = /^auth\.external\.([a-z_]+)\]/.exec(section)?.[1];
    if (name && /^enabled\s*=\s*true\b/m.test(section)) enabled.push(name);
  }
  return enabled;
}

describe("App Store review guardrails", () => {
  it("offers Sign in with Apple whenever any third-party sign-in is offered (guideline 4.8)", () => {
    const providers = enabledProviders(read("supabase/config.toml"));
    const thirdParty = providers.filter((p) => p !== "apple");
    if (thirdParty.length > 0) expect(providers).toContain("apple");
  });

  it("parses provider sections", () => {
    const toml =
      "[auth.external.google]\nenabled = true\n\n[auth.external.apple]\nenabled = false\n";
    expect(enabledProviders(toml)).toEqual(["google"]);
  });

  it("builds the mobile app from native screens, not a web view wrapping the site (guideline 4.2)", () => {
    const pkg = JSON.parse(read("apps/mobile/package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).not.toContain("react-native-webview");
  });

  it("has real mobile screens for all five tabs, not placeholders (guideline 4.2)", () => {
    for (const tab of ["today", "calendar", "courses", "focus", "stats"]) {
      const screen = read(`apps/mobile/src/app/(tabs)/${tab}.tsx`);
      expect(screen, tab).not.toContain("ScreenPlaceholder");
      expect(screen, tab).toContain("getApi()");
    }
  });

  it("asks for AI consent on mobile before a syllabus is sent (guideline 5.1.2(i), L2-AI)", () => {
    const upload = read("apps/mobile/src/app/courses/upload.tsx");
    expect(upload).toContain("<AiConsentSheet");
    // The consent check comes before the upload call.
    expect(upload.indexOf("aiAllowed()")).toBeGreaterThan(-1);
    expect(upload.indexOf("aiAllowed()")).toBeLessThan(upload.indexOf("syllabus.upload("));
  });

  it("lets tablets rotate (iPad multitasking and Play large-screen quality)", () => {
    const app = JSON.parse(read("apps/mobile/app.json")) as { expo: { orientation?: string } };
    expect(app.expo.orientation ?? "default").toBe("default");
  });

  it("keeps account deletion in the mobile app (guideline 5.1.1(v))", () => {
    const settings = read("apps/mobile/src/app/settings.tsx");
    expect(settings).toContain("account.delete(");
  });
});
