# Session Handoff Document

## 1. Goal

- StudyPulse launch work on branch `claude/studypulse-backend-prompts-161jl9` in
  `itzonice/gas.ai`: the launch-safety plan (S1–S34) and the launch-audit build items
  (L1–L10) are now all done. Keep PR #1 green and mergeable, and don't open another PR.
- The project lives in `studypulse/`: Turborepo + pnpm, Next 16 web app, Expo mobile app,
  Supabase (Postgres, RLS, Deno edge functions).
- Before every commit, run `pnpm lint`, `pnpm typecheck`, `pnpm test` and
  `pnpm format:check`, and use one commit per plan item.
- Never ask the user to paste tokens or keys into chat. Credentials go in the
  environment settings.

## 2. Current State

- **PR #1** is green on all six CI jobs (lint/typecheck/test, migrations and SQL tests,
  cross-user access, client bundle secret scan, full-history secret scan, and "Browsers,
  Lighthouse, and accessibility", which covers Chromium, Firefox, and WebKit) as of
  `2a4b196`.
- **Done:** S1–S34 and L1–L10 (L2 offline is mobile-only; the web shows a banner).
- **Latest local counts:** core 657 tests, web 117, tokens 58, Deno 19. The a11y audit
  is clean. Lighthouse is 96–100 performance and 100 accessibility on every key route
  (phone and desktop). The browser matrix passes in Chromium locally. Firefox and WebKit
  run only in CI, because they aren't installed in this environment.
- **Beta testing is still blocked** (unchanged):
  - The network policy denies `api.vercel.com` and `api.supabase.com`.
  - These secrets are missing: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`,
    `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN` (optionally `ANTHROPIC_API_KEY`).
  - Once they're in the environment settings, `pnpm deploy:beta` deploys and prints
    the link.

## 3. Active Files

- `studypulse/packages/core/src/screens/`: the shared screen models for web and mobile
  (today, calendar, courses, focus, stats, syllabus labels, undo, focus alerts,
  shortcuts, search, onboarding, offline).
- `studypulse/apps/mobile/src/app/`: the tabs plus `courses/[courseId]`,
  `courses/upload`, `courses/review/[uploadId]`, `assignments/new`, and `onboarding`.
  `src/lib/`: `hooks.ts` (`useLoad`, reduce motion, window class), `offline.ts`,
  `app-storage.ts`, `uuid.ts`.
- `studypulse/apps/web/scripts/`: `a11y-audit.mjs`, `browser-matrix.mjs`,
  `lighthouse.mjs`.
- `studypulse/scripts/seed-reviewer.mjs`: the store review account.
- `studypulse/docs/launch-audit.md`, `launch-checklist.md`, `security-audit.md` (the L10
  section is at the end), and `CHANGELOG.md`.
- `.github/workflows/ci.yml` (the `browsers` job), `deno-deps.yml`, and
  `.github/dependabot.yml`.

## 4. Changes Made

This session, one commit per item:

- **L1:** the screen models move to `@studypulse/core/screens`. Native mobile screens:
  Today, Calendar (week agenda), Courses, Course detail (scores and target), Focus
  (timer), and Stats (CSV export), plus syllabus paste or link with the AI consent sheet,
  a review screen, and Add assignment. Tablets get a rail and landscape. Reduce motion is
  respected, and swipes have button alternatives. `pnpm reviewer:seed` sets up the store
  review account.
- **L8:** Dependabot (npm and Actions), a weekly `deno outdated` workflow, and
  `CHANGELOG.md`.
- **L3:** undo toasts instead of confirmations for course and assignment deletes (web and
  mobile). The syllabus review draft and typed scores are autosaved, and the web warns
  before you leave with unsaved changes.
- **L4:** a generated chime, a notification when the tab is hidden, vibration on mobile,
  and optional breaks (5 minutes, or 15 after every fourth session).
- **L5:** Skip on every onboarding step. Mobile onboarding saves the phone's timezone
  (mobile accounts had been stuck in UTC). Keyboard shortcuts with a help list, which can
  be switched off.
- **Fix:** the app bar's search, bell, and account links opened 404s. Added `/search`;
  the bell and account button now open Settings.
- **L7:** `pnpm browsers` (Chromium, Firefox, WebKit), `pnpm lighthouse` (at least 90,
  median of 3 runs), and `pnpm a11y`, all in CI. Fixed the footer and calendar layout
  shifts, which took mobile performance from 71–87 to 96–100.
- **L10:** the security review. Mobile now clears its local data on sign-out, and the
  reviewer script refuses any account it didn't create.
- **L7 follow-up:** WebKit reports fetches cancelled by navigation as errors; these are
  now warnings. Failed steps log the page state.
- **L2:** mobile offline support (saved screens and a sync queue) and a web offline
  banner. Offline now shows up as `network_error` instead of a 500.

## 5. Failed Attempts

- **Browsers job, WebKit only** (Chromium and Firefox passed from the start):
  - Fetches cancelled by navigation were reported as uncaught errors (now warnings).
  - The shortcuts step clicked inside the sidebar (fixed).
  - A real bug: every centered dialog was 0 px tall in Safari (`height: 100%` inside an
    auto-height `<dialog>`), found from the logged dialog state (fixed, `7712dbc`).
  - The session once ended mid-run when a navigation cut off a token refresh. Steps now
    wait for the network to go quiet. The same race could log out a Safari user who
    navigates at exactly the wrong moment; if that's reported, look at the Supabase auth
    refresh-token reuse window.
- **`pkill -f "next start"` kills the shell running it**, because the pattern matches the
  command itself. Stop the server by PID instead.

## 6. Next Steps

- [ ] **CSP nonces:** drop `'unsafe-inline'` from `script-src`. It makes every page
      dynamic, so measure the cost with `pnpm lighthouse` first.
- [ ] **Mobile:** a background notification when the timer ends (needs
      `expo-notifications` and a new build), PDF and photo syllabus upload, and push
      reminders on the phone (the mobile app doesn't register for push yet).
- [ ] **Web offline writes** (a queue like the mobile one), if wanted.
- [ ] **Manual, for the owner:**
  - add the deploy secrets in the environment settings;
  - run `pnpm reviewer:seed` against production before each store submission;
  - replace the template app icons and favicon;
  - set the company name and address variables;
  - do the trademark and app-store name search;
  - do VoiceOver and TalkBack passes on real devices.
