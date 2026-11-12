// Launch safety S28: every image has alt text and every icon is either hidden from
// screen readers or named. A static check over the app sources; the axe audit
// (apps/web/scripts/a11y-audit.mjs, rules image-alt, svg-img-alt, button-name,
// link-name) confirms the rendered web pages.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { BUSINESS_PLACEHOLDERS, businessInfo } from "../legal/index.ts";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const SKIP = new Set(["node_modules", ".next", ".turbo", "dist", "dist-secret-scan", ".expo"]);

function* tsx(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* tsx(path);
    else if (entry.endsWith(".tsx") && !entry.includes(".test.")) yield path;
  }
}

const files = [...tsx(join(root, "apps/web")), ...tsx(join(root, "apps/mobile"))].map((p) => ({
  path: relative(root, p),
  text: readFileSync(p, "utf8"),
}));

/** Every JSX opening tag with the given name, attributes included. */
function tags(text: string, name: string): string[] {
  return [...text.matchAll(new RegExp(`<${name}\\b[^>]*?/?>`, "gs"))].map((m) => m[0]);
}

describe("accessible names", () => {
  it("scans both apps", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("every web <img> and <Image> has alt text", () => {
    const bad = files.flatMap(({ path, text }) =>
      [...tags(text, "img"), ...tags(text, "Image")]
        .filter((t) => !/\balt=|accessibilityLabel=|accessible=\{false\}/.test(t))
        .map((t) => `${path}: ${t.slice(0, 60)}`),
    );
    expect(bad).toEqual([]);
  });

  it("every inline <svg> is hidden or named", () => {
    const bad = files.flatMap(({ path, text }) =>
      tags(text, "svg")
        .filter((t) => !/aria-hidden|aria-label=|aria-labelledby=/.test(t))
        .map((t) => `${path}: ${t.slice(0, 60)}`),
    );
    expect(bad).toEqual([]);
  });

  it("mobile icon glyphs only go through the hidden Icon component", () => {
    const direct = files
      .filter(({ path }) => path.startsWith("apps/mobile/") && !path.endsWith("ui/Icon.tsx"))
      .filter(({ text }) => /<(MaterialIcons|Ionicons|FontAwesome)\b/.test(text))
      .map(({ path }) => path);
    expect(direct).toEqual([]);
  });
});

describe("business details (S28)", () => {
  it("shows placeholders, and says which, until configured", () => {
    expect(businessInfo({})).toEqual({
      legalName: BUSINESS_PLACEHOLDERS.legalName,
      address: BUSINESS_PLACEHOLDERS.address,
      supportEmail: "support@studypulse.app",
      missing: ["legalName", "address"],
    });
    expect(
      businessInfo({
        legalName: " StudyPulse LLC ",
        address: "PO Box 1, Austin, TX 78701, USA",
        supportEmail: "help@example.com",
      }),
    ).toEqual({
      legalName: "StudyPulse LLC",
      address: "PO Box 1, Austin, TX 78701, USA",
      supportEmail: "help@example.com",
      missing: [],
    });
  });

  it("the web footer, legal pages, and checkout use the configured details", () => {
    const web = (p: string) => files.find((f) => f.path === p)?.text ?? "";
    expect(web("apps/web/components/shell/AppShell.tsx")).toContain("<SiteFooter");
    expect(web("apps/web/components/legal/LegalPage.tsx")).toContain("<SiteFooter");
    expect(web("apps/web/components/upgrade/UpgradeScreen.tsx")).toMatch(/Sold by <CompanyName/);
    const hardcoded = files
      .filter(({ text }) => text.includes("[Company legal name]"))
      .map(({ path }) => path);
    expect(hardcoded).toEqual([]);
  });
});
