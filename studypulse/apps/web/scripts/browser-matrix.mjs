// Cross-browser check of the main flows (launch audit L7): Chromium, Firefox, and WebKit
// (Safari's engine), at a desktop and a phone size.
//
//   BROWSERS=chromium,firefox,webkit pnpm --filter @studypulse/web browsers
//   BM_BASE_URL=https://preview.example pnpm --filter @studypulse/web browsers
//
// Signs in as the demo account and, in each browser: loads every screen, moves around the
// calendar grid with the arrow keys, opens the shortcuts list with "?", shows the offline
// banner when the connection drops, starts and pauses the focus timer and checks the
// clock counts down, and opens and closes the Add score dialog. Any uncaught page error
// or failed step fails the run; console errors are listed in the report. Browsers that
// aren't installed are reported, not skipped silently.
import { writeFileSync } from "node:fs";

import { chromium, firefox, webkit } from "playwright";

const BASE = process.env.BM_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.BM_EMAIL ?? "demo@studypulse.dev";
const PASSWORD = process.env.BM_PASSWORD ?? "studypulse-demo";
const OUT = process.env.BM_REPORT ?? "browser-matrix-report.json";
const ENGINES = { chromium, firefox, webkit };
const wanted = (process.env.BROWSERS ?? "chromium,firefox,webkit").split(",").map((b) => b.trim());

const SCREENS = [
  ["/today", "Today"],
  ["/calendar", "Calendar"],
  ["/courses", "Courses"],
  ["/focus", "Focus"],
  ["/stats", "Stats"],
  ["/settings", "Settings"],
];

const failures = [];
const consoleErrors = [];

/**
 * WebKit rejects fetches that a navigation cancels (Next's link prefetches, requests of
 * the page being left) with this message, as unhandled errors. Chromium and Firefox drop
 * them quietly. They're listed, not failed; any other uncaught error fails the run.
 */
const CANCELLED_FETCH =
  /Fetch API cannot load .* due to access control checks|^TypeError: Load failed$/;

async function step(where, name, fn, page) {
  try {
    await fn();
  } catch (e) {
    // What the page looked like, so a failure in CI can be read from the log alone.
    const state = page
      ? await page
          .evaluate(() => ({
            h1: document.querySelector("h1")?.textContent ?? null,
            dialogs: [...document.querySelectorAll("dialog")].map((d) => ({
              label: d.getAttribute("aria-labelledby"),
              open: d.open,
              size: `${String(Math.round(d.getBoundingClientRect().width))}x${String(Math.round(d.getBoundingClientRect().height))}`,
            })),
            focused: document.activeElement?.outerHTML.slice(0, 120) ?? null,
          }))
          .catch(() => null)
      : null;
    failures.push({
      ...where,
      step: name,
      error: String(e).split("\n")[0].slice(0, 300),
      ...(page ? { url: page.url(), state } : {}),
    });
  }
}

async function signIn(page) {
  await page.goto(`${BASE}/sign-in`);
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
}

const clockSeconds = (text) => {
  const parts = text.trim().split(":").map(Number);
  return parts.reduce((total, n) => total * 60 + n, 0);
};

async function run(browserName, size) {
  const where = { browser: browserName, size: size.name };
  const engine = ENGINES[browserName];
  let browser;
  try {
    browser = await engine.launch();
  } catch (e) {
    failures.push({ ...where, step: "launch", error: `Not installed? ${String(e).slice(0, 200)}` });
    return;
  }
  const context = await browser.newContext({
    viewport: size.viewport,
    ...(size.touch && browserName !== "firefox" ? { isMobile: true, hasTouch: true } : {}),
  });
  const page = await context.newPage();
  const check = (name, fn) => step(where, name, fn, page);
  page.on("pageerror", (err) => {
    if (CANCELLED_FETCH.test(err.message)) {
      consoleErrors.push({
        ...where,
        path: new URL(page.url()).pathname,
        text: `cancelled by navigation: ${err.message.slice(0, 200)}`,
      });
      return;
    }
    failures.push({
      ...where,
      step: `uncaught error on ${new URL(page.url()).pathname}`,
      error: String(err).slice(0, 300),
    });
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push({
        ...where,
        path: new URL(page.url()).pathname,
        text: msg.text().slice(0, 300),
      });
    }
  });

  try {
    await check("sign in", () => signIn(page));

    for (const [path, heading] of SCREENS) {
      await check(`load ${path}`, async () => {
        await page.goto(`${BASE}${path}`);
        await page.getByRole("heading", { level: 1, name: heading }).waitFor({ timeout: 30_000 });
      });
    }

    if (!size.touch) {
      await check("calendar arrow keys", async () => {
        await page.goto(`${BASE}/calendar`);
        const grid = page.getByRole("grid");
        await grid.waitFor();
        const cell = grid.locator("[role=gridcell][tabindex='0']").first();
        await cell.focus();
        const before = await page.evaluate(() => document.activeElement?.getAttribute("data-date"));
        await page.keyboard.press("ArrowRight");
        const after = await page.evaluate(() => document.activeElement?.getAttribute("data-date"));
        if (!before || !after || before === after) {
          throw new Error(`focus didn't move right (${String(before)} -> ${String(after)})`);
        }
      });

      await check("shortcuts list", async () => {
        await page.goto(`${BASE}/today`);
        await page.getByRole("heading", { level: 1, name: "Today" }).waitFor();
        // Nothing focused, so the key goes to the page (not a link or field).
        await page.evaluate(() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        });
        await page.keyboard.press("?");
        await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor({ timeout: 5_000 });
        await page.keyboard.press("Escape");
      });
    }

    await check("offline banner", async () => {
      await page.goto(`${BASE}/today`);
      await page.getByRole("heading", { level: 1, name: "Today" }).waitFor();
      await context.setOffline(true);
      await page.getByText("You're offline.").waitFor({ timeout: 5_000 });
      await context.setOffline(false);
      await page.getByText("You're offline.").waitFor({ state: "hidden", timeout: 5_000 });
    });

    await check("focus timer counts down, pauses, ends", async () => {
      await page.goto(`${BASE}/focus`);
      const target = page.getByLabel("Working on");
      await target.waitFor();
      const options = await target.locator("option:not([disabled])").all();
      const value = options[0] ? await options[0].getAttribute("value") : null;
      if (!value) throw new Error("nothing to focus on");
      await target.selectOption(value);
      await page.getByRole("button", { name: "Start focus" }).first().click();
      const timer = page.getByRole("timer");
      await page.getByRole("button", { name: "Pause" }).waitFor({ timeout: 10_000 });
      const start = clockSeconds(await timer.innerText());
      await page.waitForTimeout(2_500);
      const later = clockSeconds(await timer.innerText());
      if (!(later < start)) throw new Error(`clock didn't count down (${start} -> ${later})`);
      await page.getByRole("button", { name: "Pause" }).click();
      await page.getByRole("button", { name: "Resume" }).waitFor();
      await page.getByRole("button", { name: "End session" }).click();
      await page.getByRole("button", { name: "Start focus" }).first().waitFor();
    });

    await check("course detail and Add score dialog", async () => {
      await page.goto(`${BASE}/courses`);
      await page.getByRole("heading", { level: 1, name: "Courses" }).waitFor();
      await page.locator("a[href^='/courses/']:not([href='/courses/upload'])").first().click();
      await page.waitForURL(/\/courses\/[0-9a-f-]{36}$/);
      await page.getByRole("heading", { name: "Grade categories" }).waitFor();
      await page.getByRole("button", { name: "Add score" }).first().click();
      await page.getByRole("dialog", { name: "Add score" }).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("dialog", { name: "Add score" }).waitFor({ state: "hidden" });
    });
  } finally {
    await browser.close();
  }
}

const SIZES = [
  { name: "desktop", viewport: { width: 1280, height: 900 } },
  { name: "phone", viewport: { width: 390, height: 844 }, touch: true },
];

for (const name of wanted) {
  if (!(name in ENGINES)) {
    failures.push({ browser: name, size: "-", step: "config", error: "Unknown browser" });
    continue;
  }
  for (const size of SIZES) await run(name, size);
}

writeFileSync(OUT, JSON.stringify({ browsers: wanted, failures, consoleErrors }, null, 2));
if (consoleErrors.length) {
  console.log(`Console errors (not failing the run): ${String(consoleErrors.length)}, see ${OUT}`);
}
if (failures.length) {
  console.log(`Browser matrix: ${String(failures.length)} failure(s).`);
  for (const f of failures) {
    console.log(`  ${f.browser}/${f.size}: ${f.step}: ${f.error}`);
    if (f.url) console.log(`      at ${f.url}; ${JSON.stringify(f.state)}`);
  }
  process.exitCode = 1;
} else {
  console.log(`Browser matrix: every flow passed in ${wanted.join(", ")}.`);
}
