# StudyPulse

StudyPulse turns a student's syllabi into a plan. A student uploads a syllabus (PDF, pasted
text, or URL); an AI parser extracts the course, grade categories, and assignments. From that
we compute current grades, "what do I need on the final" answers, a ranked Today feed, and
scheduled study blocks, and send reminders before things are due.

This repo holds the backend, business logic, and infrastructure. UI/UX work lives in the app
shells but is out of scope for most tasks.

## Stack

- **Monorepo:** pnpm workspaces + Turborepo. Node 22+, pnpm 10.
- **Web:** Next.js (App Router, TypeScript) in `apps/web`.
- **Mobile:** Expo (React Native, TypeScript) in `apps/mobile`.
- **Backend:** Supabase: Postgres (migrations, RLS, SQL functions/RPCs), Auth, Storage,
  Edge Functions (Deno) in `supabase/functions`.
- **Validation:** zod everywhere a value crosses a boundary.
- **Tests:** Vitest (+ fast-check for property tests) for TypeScript; SQL tests for RLS and
  database functions.
- **Services:** an LLM for syllabus parsing, Stripe (web billing), RevenueCat (mobile
  billing), Expo push + VAPID web push, Resend (email), Sentry (errors), PostHog (analytics).

## Layout

```
apps/
  web/            Next.js app (App Router)
  mobile/         Expo app
packages/
  core/           Shared business logic: grades, priority, scheduling, parser, API client
  db/             Database types generated from the Supabase schema
supabase/
  migrations/     SQL migrations (the source of truth for the schema)
  functions/      Edge Functions (Deno)
  tests/          SQL tests (RLS, constraints, functions)
  seed.sql        Local demo data
```

## Commands

```sh
pnpm install
pnpm lint          # ESLint in every workspace
pnpm typecheck     # tsc --noEmit in every workspace
pnpm test          # unit tests
pnpm format        # Prettier
```

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` before calling a task done.

## Rules

1. **Validate inputs with zod.** Every edge function body, RPC wrapper argument, webhook
   payload, env var, and AI response is parsed with a zod schema before use. Never trust
   `as` casts on external data.
2. **Keep business logic out of clients.** Grade math, priority ranking, scheduling, limits,
   and entitlement checks live in `packages/core`, SQL functions, or edge functions. The web
   and mobile apps only render and call the API. Anything that enforces a rule (plan limits,
   ownership, quotas) must be enforced server-side (RLS, triggers, or edge functions), even
   if the client also checks it.
3. **Store timestamps in UTC.** Use `timestamptz` in Postgres and ISO 8601 strings with a `Z`
   or offset in TypeScript. Never store local wall-clock times without a zone.
4. **Keep the user's timezone on their profile.** `profiles.timezone` holds an IANA zone
   (e.g. `America/Chicago`). Convert to local time only when computing "today", default due
   times, reminder windows, and quiet hours, using that zone.
5. **Every table has RLS enabled.** Users can only touch their own rows. Child tables check
   ownership through their parent course. Service-role-only tables (e.g. subscriptions) have
   no client write policies.
6. **Schema changes go through migrations.** Never edit an applied migration; add a new one.
   Regenerate `packages/db` types after every schema change.
7. **Secrets stay server-side.** Service-role keys, Stripe secrets, and AI API keys are only
   read in edge functions or server code, never shipped to clients.
8. **Test the logic that matters.** Grade math, priority, scheduling, RLS, and payment
   webhooks need tests. Prefer pure functions in `packages/core` so they are easy to test.

## Conventions

- Strict TypeScript (`noUncheckedIndexedAccess` on). No `any`; use `unknown` and narrow.
- Workspace packages ship TypeScript source (no build step); import as `@studypulse/core`
  and `@studypulse/db`.
- Money is stored in integer cents; percentages and weights as numbers from 0 to 100.
- Durations are stored in whole minutes.
