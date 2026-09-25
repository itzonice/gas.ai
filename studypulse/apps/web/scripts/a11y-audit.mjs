// Accessibility audit of the running web app (UI prompt 87).
//
//   pnpm --filter @studypulse/web a11y            # against http://localhost:3000
//   A11Y_BASE_URL=https://preview.example pnpm --filter @studypulse/web a11y
//
// Signs in as the demo account (pnpm local seeds it) and, for every screen at phone,
// tablet, and desktop widths in light and dark themes:
// - runs axe-core (WCAG 2.0/2.1/2.2 A and AA, plus best practices), color contrast included
// - tabs through the page: the skip link comes first, and every focused control shows a
//   visible focus indicator
// - measures tap targets: controls must be at least 48 x 48 px (CLAUDE.md), except links
//   inside running text
// - reflow: no horizontal scrolling at 320 px wide, or at 200% text size
// - third parties (launch safety S13): every request goes to the app itself or Supabase.
//   No fonts, analytics, or trackers from anyone else, signed in or out (nothing needs
//   consent because nothing is sent). The report lists every outside host it saw.
// Writes a JSON report and exits 1 if anything fails.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const AXE = require.resolve("axe-core/axe.min.js");
const BASE = process.env.A11Y_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.A11Y_EMAIL ?? "demo@studypulse.dev";
const PASSWORD = process.env.A11Y_PASSWORD ?? "studypulse-demo";
const OUT = process.env.A11Y_REPORT ?? "a11y-report.json";
const WIDTHS = [375, 768, 1600];
const SUPABASE =
  process.env.A11Y_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const FIRST_PARTY = new Set([new URL(BASE).origin, new URL(SUPABASE).origin]);
const thirdParty = new Map(); // origin -> first page it was seen on
const SCHEMES = ["light", "dark"];

/** Screens, with a selector that means "loaded", and optional interactions to audit. */
const SCREENS = [
  { path: "/today", ready: "h1:text('Today')", settle: "section" },
  { path: "/calendar", ready: "h1:text('Calendar')" },
  { path: "/courses", ready: "h1:text('Courses')", settle: "a[href^='/courses/']" },
  { path: "COURSE", ready: "h1" },
  { path: "/courses/upload", ready: "h1" },
  { path: "/focus", ready: "[role=timer]" },
  { path: "/stats", ready: "h1:text('Stats')" },
  { path: "/settings", ready: "h2:text('Reminders')" },
  { path: "/upgrade", ready: "table" },
];

/** Dialogs and menus that only exist after an interaction. */
const INTERACTIONS = [
  { path: "/calendar", name: "add assignment dialog", open: "button:has-text('Add assignment')" },
  { path: "COURSE", name: "add score dialog", open: "button:has-text('Add score')" },
  { path: "/today", name: "overflow menu", open: "button[aria-label='More actions']" },
  { path: "/settings", name: "delete account dialog", open: "button:has-text('Delete account')" },
];

const results = [];
const fail = (entry) => results.push(entry);

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60_000 });
}

async function axe(page, context) {
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  const { violations } = await page.evaluate(async () =>
    axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"],
      },
    }),
  );
  for (const v of violations) {
    fail({
      ...context,
      check: `axe:${v.id}`,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes
        .slice(0, 5)
        .map((n) => ({ target: n.target.join(" "), summary: n.failureSummary })),
    });
  }
}

/** Tabs through the page; checks the skip link is first and each stop shows focus. */
async function keyboard(page, context) {
  await page.evaluate(() => {
    document.activeElement?.blur();
    window.scrollTo(0, 0);
  });
  await page.keyboard.press("Tab");
  const first = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? "");
  if (first !== "Skip to main content") {
    fail({ ...context, check: "keyboard:skip-link-first", help: `First tab stop was "${first}"` });
  }
  const seen = new Set();
  for (let i = 0; i < 80; i++) {
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      // The Next.js dev overlay only exists in development.
      if (el.tagName === "NEXTJS-PORTAL")
        return { key: "dev-overlay", desc: "", visible: true, hidden: false, skip: true };
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const outline = s.outlineStyle !== "none" && parseFloat(s.outlineWidth) >= 2;
      const ring = s.boxShadow !== "none";
      const desc =
        el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 40) ?? el.tagName;
      return {
        key: `${el.tagName}:${desc}:${Math.round(r.x)}:${Math.round(r.y)}`,
        desc: `${el.tagName.toLowerCase()} "${desc}"`,
        visible: outline || ring,
        hidden: r.width === 0 || r.height === 0,
      };
    });
    if (!info) break;
    if (info.skip) {
      await page.keyboard.press("Tab");
      continue;
    }
    if (seen.has(info.key)) break; // wrapped around
    seen.add(info.key);
    if (info.hidden) fail({ ...context, check: "keyboard:focus-on-hidden", help: info.desc });
    else if (!info.visible) fail({ ...context, check: "keyboard:focus-visible", help: info.desc });
    await page.keyboard.press("Tab");
  }
}

/** Controls smaller than 48 x 48 px (links inside running text are exempt). */
async function targets(page, context) {
  const small = await page.evaluate(() => {
    const out = [];
    const controls = document.querySelectorAll(
      "button, [role=button], input:not([type=hidden]), select, textarea, a[href], [role=tab], [role=menuitem], [role=gridcell][tabindex], summary",
    );
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.closest("[inert], [aria-hidden=true]")) continue;
      // The skip link is only visible (and only a target) while focused.
      if (el.matches("a[href='#main']") && document.activeElement !== el) {
        el.focus();
        const f = el.getBoundingClientRect();
        el.blur();
        if (f.height < 47.5)
          out.push(`skip link ${Math.round(f.width)}x${Math.round(f.height)} when focused`);
        continue;
      }
      // Checkboxes, radios, and visually hidden inputs (e.g. a file input behind a styled
      // label) count their label as the target.
      const label =
        el.matches("input[type=checkbox], input[type=radio]") ||
        (el.tagName === "INPUT" && r.width <= 2)
          ? (el.closest("label") ?? el.labels?.[0] ?? null)
          : null;
      const box = label ? label.getBoundingClientRect() : r;
      const inline = el.tagName === "A" && getComputedStyle(el).display === "inline";
      if (inline) continue;
      if (box.width < 47.5 || box.height < 47.5) {
        const name = el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 40);
        out.push(
          `${el.tagName.toLowerCase()} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
      }
    }
    return out;
  });
  for (const s of small) fail({ ...context, check: "target-size-48", help: s });
}

async function reflow(page, context) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 1)
    fail({ ...context, check: "reflow", help: `${overflow}px of horizontal scroll` });
}

async function load(page, path, ready) {
  await page.goto(`${BASE}${path}`);
  await page.locator(ready).first().waitFor({ timeout: 30_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(300);
}

const browser = await chromium.launch();
try {
  for (const scheme of SCHEMES) {
    const ctx = await browser.newContext({
      colorScheme: scheme,
      viewport: { width: 1600, height: 1000 },
    });
    const page = await ctx.newPage();
    page.on("request", (req) => {
      const url = req.url();
      if (!/^https?:|^wss?:/.test(url)) return; // data:, blob:
      const origin = new URL(url).origin.replace(/^ws/, "http");
      if (FIRST_PARTY.has(origin) || thirdParty.has(origin)) return;
      const where = new URL(page.url() || BASE).pathname;
      thirdParty.set(origin, where);
      fail({
        path: where,
        width: 0,
        scheme,
        check: "third-party request",
        help: url.slice(0, 200),
      });
    });
    // Signed out: sign-in and the legal pages.
    for (const [path, width] of ["/sign-in", "/terms", "/privacy"].flatMap((p) =>
      [375, 1600].map((w) => [p, w]),
    )) {
      await page.setViewportSize({ width, height: 1000 });
      await load(page, path, "h1");
      const context = { path, width, scheme };
      await axe(page, context);
      await targets(page, context);
      await reflow(page, context);
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
    await signIn(page);
    // A real course id for the detail screen.
    await load(page, "/courses", "h1:text('Courses')");
    const courseHref = await page
      .locator("a[href^='/courses/']:not([href='/courses/upload'])")
      .first()
      .getAttribute("href");
    const resolve = (p) => (p === "COURSE" ? (courseHref ?? "/courses") : p);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 });
      for (const s of SCREENS) {
        const path = resolve(s.path);
        const context = { path, width, scheme };
        try {
          await load(page, path, s.ready);
        } catch (e) {
          fail({ ...context, check: "load", help: String(e).slice(0, 200) });
          continue;
        }
        await axe(page, context);
        // Keyboard first: measuring the skip link focuses it, which moves the tab start.
        if (width === 1600) await keyboard(page, context);
        await targets(page, context);
        await reflow(page, context);
      }
    }

    // Dialogs and menus (desktop and phone, this scheme).
    for (const width of [375, 1600]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const it of INTERACTIONS) {
        const path = resolve(it.path);
        const context = { path: `${path} (${it.name})`, width, scheme };
        try {
          await load(page, path, "h1");
          await page.locator(it.open).first().click();
          await page.waitForTimeout(300);
        } catch (e) {
          fail({ ...context, check: "open", help: String(e).slice(0, 200) });
          continue;
        }
        await axe(page, context);
        await targets(page, context);
        await page.keyboard.press("Escape");
      }
    }

    // Reflow at 320 px and at 200% text size (light only: layout doesn't change by theme).
    if (scheme === "light") {
      for (const s of SCREENS) {
        const path = resolve(s.path);
        await page.setViewportSize({ width: 320, height: 800 });
        await load(page, path, s.ready);
        await reflow(page, { path, width: 320, scheme });
        await page.setViewportSize({ width: 1280, height: 800 });
        await load(page, path, s.ready);
        await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
        await page.waitForTimeout(200);
        await reflow(page, { path, width: 1280, scheme, textSize: "200%" });
      }
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(
  thirdParty.size
    ? `Third-party requests: ${[...thirdParty].map(([o, p]) => `${o} (first on ${p})`).join(", ")}`
    : `Third-party requests: none (only ${[...FIRST_PARTY].join(" and ")}).`,
);
const byCheck = new Map();
for (const r of results) byCheck.set(r.check, (byCheck.get(r.check) ?? 0) + 1);
if (results.length === 0) {
  console.log("Accessibility audit: no issues found.");
} else {
  console.log(`Accessibility audit: ${results.length} issue(s). Report: ${OUT}`);
  for (const [check, n] of [...byCheck].sort((a, b) => b[1] - a[1]))
    console.log(`  ${n}\t${check}`);
  process.exitCode = 1;
}
