# StudyPulse

StudyPulse turns a student's syllabi into a plan. A student uploads a syllabus (PDF, pasted
text, or URL); an AI parser extracts the course, grade categories, and assignments. From that
we compute current grades, "what do I need on the final" answers, a ranked Today feed, and
scheduled study blocks, and send reminders before things are due.

This repo holds the backend, business logic, and infrastructure, plus the web and mobile UI.
UI work follows the design system in "UI design" below.

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

## UI design

StudyPulse uses a Material Design 3 responsive layout: an app bar, a sidebar that collapses
to a rail and then bottom navigation, and one primary action per screen.

### Layout and navigation

Five top-level destinations: Today, Calendar, Courses, Focus, and Stats. Settings and account
sit at the bottom of the sidebar. The information architecture stays the same at every size;
only the presentation changes.

| Viewport                | Navigation                         | Content                         | StudyPulse behavior                                                |
| ----------------------- | ---------------------------------- | ------------------------------- | ------------------------------------------------------------------ |
| Phone, under 600 px     | Bottom navigation, 5 destinations  | One column                      | "Start focus" stays visible as a floating button; task cards stack |
| Tablet, 600–1023 px     | Navigation rail, icons plus labels | One or two columns              | Metric cards in a 2-column grid; search in the app bar             |
| Desktop, 1024 px and up | Persistent sidebar, 280 px         | Main content, 1200 px max width | Readable width; extra space stays as whitespace                    |
| Wide, 1440 px and up    | Persistent sidebar                 | Main plus right panel           | Right panel shows upcoming exams and the focus timer               |

App bar: logo, search across courses and assignments, notifications, and profile. On phones
it shows only the logo and one action.

Skip link: "Skip to main content" comes first in the tab order. Use semantic landmarks:
header, nav, main, and footer.

### Visual system

Colors are assigned by role, never as decoration. Each course's color_hex is used only as an
identifying tint, never for status.

| Role                 | StudyPulse use                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------- |
| primary / on-primary | The single main action per screen: Start focus, Upload syllabus, Save schedule               |
| surface              | Page background                                                                              |
| surface-container    | Task cards, metric cards, and the syllabus review drawer                                     |
| secondary-container  | Filters, course chips, and secondary actions                                                 |
| error / on-error     | Overdue tasks, grade at risk, and delete confirmations                                       |
| on-surface-variant   | Due times, weights, and other metadata                                                       |
| outline-variant      | Dividers between list rows                                                                   |
| Course tint          | A 4 px left stripe and the course chip background, always shown with the course code as text |

Spacing: an 8 px rhythm. Use 8 px between related items, 16 px for card padding, 24 px
between sections, and 32 px for major separation.

Corners: 8 px for controls, 12 px for cards, and 16 px for sheets and drawers.

Type: Roboto or a system sans stack. Page titles 32 px, section headings 22 px, card titles
16 px, body 14–16 px, and labels 12–14 px. Use medium weight for headings and regular for
body text.

Themes: build light and dark from the same semantic tokens. Test every course color against
both themes.

### Key screens

Every screen has one H1, an optional one-line description, and one primary action. Secondary
actions go in an overflow menu.

| Screen          | H1 and primary action                     | Metric cards                                          | Main content                                                           | Wide-screen right panel       |
| --------------- | ----------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------- |
| Today           | "Today" · Start focus                     | Due this week, focus hours this week, courses at risk | Due reviews first, then ranked tasks as a list                         | Next exam countdown and timer |
| Calendar        | "Calendar" · Add assignment               | None                                                  | Month or week grid; on phones, a day-by-day agenda list                | Selected day's details        |
| Courses         | "Courses" · Upload syllabus               | None                                                  | One card per course: code, current grade, next due item                | None                          |
| Course detail   | Course code and title · Add score         | Current grade, target, score needed on the final      | Category weights, then assignments as a table; on phones, a list       | What-if calculator            |
| Syllabus review | "Review your schedule" · Save to calendar | Items found, items needing review                     | Editable list of parsed items, with low-confidence items flagged first | Original syllabus text        |
| Focus           | "Focus" · Start or pause                  | Today's minutes, streak                               | Large timer and the linked task                                        | Session history               |
| Stats           | "Stats" · Export                          | Weekly focus hours, average grade                     | Focus minutes against grade per course                                 | None                          |

Use a plain list for tasks and assignments, not a card per item. When a whole row opens a
task, don't put buttons inside the row; put the checkbox and overflow menu in their own tap
targets outside the row's link area.

### Accessibility

- Text contrast of at least 4.5:1, or 3:1 for large text and essential graphics. Limit course
  colors to a vetted palette that passes in both themes, instead of a free color picker.
- Never signal status with color alone. Overdue tasks get the word "Overdue" and an icon;
  courses always show their code.
- Tap targets of at least 48 px with 8 px between them. This matters most for task
  checkboxes and timer controls.
- Visible focus rings on every control, with full keyboard support in the calendar grid,
  drawers, menus, and the review list.
- Icon-only buttons get an accessible name, such as aria-label="Start focus session".
- The timer announces only start, pause, and finish through a polite live region, never
  every second.
- Form fields in the review drawer and score entry use real labels; placeholders are only
  examples.
- Layouts must hold up at 200% text size, with no fixed-height text containers that clip.
