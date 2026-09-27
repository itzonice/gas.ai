# Session Handoff Document

## 1. Goal

- Finish the StudyPulse launch-safety plan (S1–S34), then the launch-audit build items
  (L1–L10), on branch `claude/studypulse-backend-prompts-161jl9` in `itzonice/gas.ai`.
  Keep PR #1 green and mergeable, and don't open another PR.
- The project lives in `studypulse/`: Turborepo + pnpm, Next 16 web app, Expo mobile app,
  Supabase (Postgres, RLS, Deno edge functions).
- Before every commit, run `pnpm lint`, `pnpm typecheck`, `pnpm test` and
  `pnpm format:check`, and use one commit per plan item.
- Never ask the user to paste tokens or keys into chat. Credentials go in the
  environment settings.

## 2. Current State

- **PR #1** is open, green on all four CI jobs (lint/typecheck/test, migrations and SQL
  tests, cross-user access, client bundle secret scan) and mergeable. Its head is
  `e66be16`.
- **Done and pushed:** S1–S33. The latest items:
  - S27: license check.
  - S28: business details in the footer and at checkout.
  - S29: web session in cookies, verified with `getUser` in `proxy.ts`.
  - S30: CI check that every edge function has auth, zod validation and a rate limit.
  - S31: gitleaks in a pre-commit hook and CI (full history), `.env*` ignored, and
    secrets, emails and syllabus text redacted from logs and Sentry.
  - S29–S30 follow-up: SQL test 670 for `SECURITY DEFINER` functions, zod coverage of
    every RPC argument, proxy redirect tests, and `pnpm deps:audit` in CI.
  - S32: admin role in `app_metadata` (only the service role can set it), checked live
    on the server by admin RPCs and the `admin-refund` edge function; 403 otherwise;
    every admin action logged in `private.admin_actions`.
  - S33: test-only switches refused in production, source maps never served, API exposes
    only `public`, RLS on every table we own, every bucket private, and a guard against
    debug, seed, and test endpoints.
- **Not started:** S32–S34 and L1–L10.
- **Beta testing is still blocked:**
  - The environment's network policy denies `api.vercel.com` and `api.supabase.com`.
  - These secrets are missing: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`,
    `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN` (and optionally `ANTHROPIC_API_KEY`).
  - The user adds these in the environment settings, never in chat.
- **Store blockers from `docs/launch-audit.md`:** the mobile tabs are placeholders (L1),
  and there's no in-app AI consent step (L2).
- **Latest local test counts:** core 560+, web 110, 711 SQL tests. The cross-user suite
  made 420 attempts with 0 failures, and the axe accessibility audit is clean.

## 3. Active Files

- `studypulse/docs/security-audit.md`: one section per S item. Add S31 onward here.
- `studypulse/docs/launch-audit.md` and `studypulse/docs/launch-checklist.md`.
- `studypulse/packages/core/src/observability/index.ts` and `logger.ts`: redaction (S31).
- `studypulse/scripts/`: `license-check.mjs`, `secret-scan.mjs`, `cross-user.sh`,
  `serve-functions.mjs`, `gitleaks.sh`.
- `studypulse/supabase/functions/_shared/endpoints.ts` and `endpoints.test.ts`: the
  per-function auth and input manifest (S30).
- `studypulse/supabase/functions/_shared/http.ts`: `parseJsonBody` (with `allowEmpty`)
  and `parseQuery`.
- `studypulse/apps/web/proxy.ts` and `studypulse/apps/web/lib/auth-routes.ts`: the
  server-side session check (S29).
- `.github/workflows/ci.yml`: CI jobs. It runs in `studypulse/` by default.

## 4. Changes Made

This session:

- **S27** (`cfbc8ac`): `pnpm licenses:check` in CI fails on GPL, AGPL or unreviewed
  licenses. `docs/licenses.md` lists fonts, icons and dependencies. The launch checklist
  adds a USPTO and app-store name search, and a reminder that the app icons and favicon
  are still template placeholders.
- **S28** (`290c79f`):
  - The legal business name, address and support email appear in the site footer, on
    checkout ("Sold by …"), in mobile Settings and on the legal pages.
  - They're set by the `NEXT_PUBLIC_COMPANY_*` and `EXPO_PUBLIC_COMPANY_*` variables;
    `deploy:check --strict` fails without them.
  - Mobile icons now go through `ui/Icon`, which hides them from screen readers.
- **Calendar test fix** (`4fe8c9f`): the test now waits for focus to move after a
  keypress.
- **S29** (`5752a29`):
  - The web session is now in cookies via `@supabase/ssr` (Lax, Secure on HTTPS).
  - `proxy.ts` checks the session with `getUser` and redirects signed-out visitors to
    `/sign-in?next=…`.
  - The cookies are not httpOnly, by design; the reason is in the audit doc.
- **S30** (`bbef2cd`): an endpoint manifest plus a CI test over the 22 functions. It
  found four places that read query strings without zod validation (calendar-feed,
  email-unsubscribe and both OAuth callbacks); those are fixed.
- **SQL test fix** (`e66be16`): `490_focus_overview` no longer fails between 18:30 and
  18:50 UTC, the 20 minutes after midnight in Kolkata.

## 5. Failed Attempts

- **The S31 commit was blocked by its own new pre-commit hook.** gitleaks flagged two
  fake secrets in `observability.test.ts`:
  - a Stripe-style `sk_live_…` string (line ~56);
  - a JWT string (line ~80).

  Everything else in S31 passed: lint, typecheck, tests, the full-history gitleaks scan
  (126 commits, clean after one allowlist entry) and a test that the hook blocks a
  staged fake key. Fixed by assembling the fake values at runtime in the test.

- **The first full-history gitleaks run found one hit:** the published RFC 8291 test
  vectors in `studypulse/packages/core/src/notify/webpush.test.ts`. These are not real
  secrets. `.gitleaks.toml` allowlists those exact values in that one file.

## 6. Next Steps

- [ ] **CSP nonces:** per-request nonces in `proxy.ts` to drop `'unsafe-inline'` from
      `script-src` (makes every page dynamic; measure the cost first).
- [ ] **S34:**
  - email confirmation;
  - a minimum password length of 10;
  - leaked-password protection;
  - dynamic SQL through `format()` or bound parameters;
  - request zod schemas made `.strict()`.
- [ ] **L1–L10** from `docs/launch-audit.md`. The mobile tabs (L1) and the AI consent
      step (L2) come first; both block store review.
- [ ] **Manual, for the owner:**
  - add the deploy secrets in the environment settings;
  - replace the template app icons and favicon;
  - set the company name and address variables;
  - do the trademark and app-store name search.
