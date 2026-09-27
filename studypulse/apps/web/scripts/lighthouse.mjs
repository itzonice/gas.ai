// Lighthouse budgets for key routes (launch audit L7).
//
//   pnpm --filter @studypulse/web lighthouse        # against http://localhost:3000
//   LH_BASE_URL=https://preview.example pnpm --filter @studypulse/web lighthouse
//
// Signs in as the demo account in a Chromium profile (Playwright's browser), then runs
// Lighthouse on each route in that profile, so signed-in screens are measured as a
// student sees them. Fails when accessibility or performance is under its budget on any
// route. Writes a JSON summary (and each full report) for the CI artifact.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import lighthouse from "lighthouse";
import desktopConfig from "lighthouse/core/config/desktop-config.js";
import { chromium } from "playwright";

const BASE = process.env.LH_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.LH_EMAIL ?? "demo@studypulse.dev";
const PASSWORD = process.env.LH_PASSWORD ?? "studypulse-demo";
const OUT = process.env.LH_REPORT_DIR ?? "lighthouse-report";
const PORT = Number(process.env.LH_PORT ?? 9223);
/** Runs per route and form factor; the median performance run is the one judged. */
const RUNS = Math.max(1, Number(process.env.LH_RUNS ?? 3));

/** Minimum scores (0-100). Accessibility is also audited in depth by `pnpm a11y`. */
export const BUDGETS = { accessibility: 90, performance: 90 };

/** Signed-out pages first, then the main screens. */
const ROUTES = ["/sign-in", "/privacy", "/today", "/calendar", "/courses", "/focus", "/stats"];

/** Mobile (Lighthouse's default: a mid-range phone on a slow 4G) and desktop. */
const FORM_FACTORS = [
  { name: "mobile", config: undefined },
  { name: "desktop", config: desktopConfig },
];

mkdirSync(OUT, { recursive: true });
const profile = mkdtempSync(join(tmpdir(), "sp-lighthouse-"));
const context = await chromium.launchPersistentContext(profile, {
  args: [`--remote-debugging-port=${String(PORT)}`],
});
const results = [];
try {
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(`${BASE}/sign-in`);
  // A privacy choice, so the consent banner doesn't cover the pages being measured.
  await page.evaluate(() => {
    window.localStorage.setItem(
      "studypulse.privacy-choices",
      JSON.stringify({
        analytics: false,
        errorReports: false,
        version: "2026-09-25",
        at: new Date().toISOString(),
      }),
    );
  });
  await page.reload();
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 60_000 });

  for (const factor of FORM_FACTORS) {
    for (const route of ROUTES) {
      const url = `${BASE}${route}`;
      // Several runs, keeping the one with the median performance score, so one noisy
      // run on a shared CI machine doesn't decide the budget.
      const runs = [];
      for (let i = 0; i < RUNS; i++) {
        const result = await lighthouse(
          url,
          {
            port: PORT,
            output: "json",
            logLevel: "error",
            onlyCategories: ["performance", "accessibility"],
            // Keep the signed-in session and the privacy choice.
            disableStorageReset: true,
          },
          factor.config,
        );
        if (!result) throw new Error(`Lighthouse returned nothing for ${url}`);
        runs.push(result);
      }
      runs.sort(
        (a, b) =>
          (a.lhr.categories.performance?.score ?? 0) - (b.lhr.categories.performance?.score ?? 0),
      );
      const run = runs[Math.floor(runs.length / 2)];
      const { categories, audits } = run.lhr;
      const scores = {
        performance: Math.round((categories.performance?.score ?? 0) * 100),
        accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
      };
      const failing = Object.entries(BUDGETS)
        .filter(([key, min]) => scores[key] < min)
        .map(([key, min]) => `${key} ${String(scores[key])} < ${String(min)}`);
      results.push({
        route,
        formFactor: factor.name,
        finalUrl: run.lhr.finalDisplayedUrl,
        ...scores,
        lcp: audits["largest-contentful-paint"]?.displayValue,
        tbt: audits["total-blocking-time"]?.displayValue,
        cls: audits["cumulative-layout-shift"]?.displayValue,
        failing,
      });
      const file = `${factor.name}${route.replaceAll("/", "_") || "_root"}.json`;
      writeFileSync(join(OUT, file), typeof run.report === "string" ? run.report : "");
      console.log(
        `${factor.name.padEnd(7)} ${route.padEnd(10)} perf ${String(scores.performance).padStart(3)}  a11y ${String(scores.accessibility).padStart(3)}  LCP ${String(results.at(-1).lcp)}  TBT ${String(results.at(-1).tbt)}  CLS ${String(results.at(-1).cls)}${failing.length ? `  FAIL: ${failing.join(", ")}` : ""}`,
      );
    }
  }
} finally {
  await context.close();
  rmSync(profile, { recursive: true, force: true });
}

writeFileSync(join(OUT, "summary.json"), JSON.stringify({ budgets: BUDGETS, results }, null, 2));
const failed = results.filter((r) => r.failing.length);
if (failed.length) {
  console.log(
    `Lighthouse: ${String(failed.length)} of ${String(results.length)} runs under budget.`,
  );
  process.exitCode = 1;
} else {
  console.log(`Lighthouse: all ${String(results.length)} runs within budget.`);
}
