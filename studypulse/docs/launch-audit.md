# Launch checklist audit

The legal rules behind these items, with sources, are in [legal-rules.md](legal-rules.md).

StudyPulse checked against the "Vibe-Coded App Launch Checklist" (Sep 25, 2026). Each
item is marked:

- ✅ **Done**, with where it lives.
- 🟡 **Partial**.
- ❌ **Missing** (buildable).
- 👤 **Needs you**: a decision, a console form, a lawyer, or people.
- ➖ **Doesn't apply** to this app.

The **Plan** column names the build item that closes the gap. S-numbers refer to the
launch-safety plan; L-numbers are new items from this audit (listed at the end).

The deploy steps themselves (keys, projects, EAS, backups) are in
[launch-checklist.md](launch-checklist.md). This is general information, not legal
advice.

## Legal and privacy

### Every app

| Item                                                   | Status | Where / what's left                                                                                                                                                                      | Plan                 |
| ------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Privacy policy in plain words, linked in app and store | 🟡     | Draft at `/privacy` (processors table, retention, deletion), linked from web settings, mobile settings, and sign-up. Still marked draft with placeholders (company name, support email). | 👤 fill placeholders |
| Terms of use                                           | 🟡     | Draft at `/terms`: acceptable use, as-is, liability cap, users own content. Same placeholders; no record of acceptance yet.                                                              | S21                  |
| Collect only what a feature needs                      | ✅     | No contacts, location, microphone, or camera permissions. Analytics events carry no names, titles, or grades ([analytics.md](analytics.md)).                                             | S25 re-check         |
| In-app "Delete my account and data"                    | ✅     | Settings → Delete account on web and mobile (`delete-account` function; cascades storage and rows).                                                                                      | —                    |
| Export my data (JSON)                                  | ✅     | `export-data` function, Settings → Export. Cards also export for Anki and Quizlet.                                                                                                       | —                    |
| Every third party listed in the policy                 | ✅     | Processors table in `/privacy`: Supabase, Anthropic, Stripe, RevenueCat, Resend, Expo, Sentry, PostHog, Google (Calendar sync only).                                                     | keep in sync         |
| No tracking or ad SDKs without consent                 | ✅     | No ad SDKs. PostHog runs only server-side from an outbox (no client SDK, no cookies). Sentry has no session replay.                                                                      | —                    |

### Children (COPPA)

| Item                                                  | Status    | Where / what's left                                                                                                                                  | Plan                           |
| ----------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Decide whether the app is directed to children        | 👤        | Recommended: a 13+ general-audience app for high school and college. The terms already say 13+.                                                      | 👤 decide                      |
| Parental consent / separate consent for third parties | ➖ if 13+ | Required only if under-13s are allowed. Accounts plus AI parsing make an under-13 mode a large project.                                              | —                              |
| Security program and retention policy                 | ✅        | [security-program.md](security-program.md): owner, safeguards, regular checks, and a retention schedule. Owner fills the names and signs off yearly. | L9 (done)                      |
| Keep under-13s out                                    | ❌        | No age gate at sign-up yet.                                                                                                                          | S12 (before_user_created hook) |

### EU/UK (GDPR)

| Item                               | Status     | Where / what's left                                                                                                                            | Plan                   |
| ---------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Lawful basis for each kind of data | ✅         | Privacy policy, "Legal bases": contract, consent (AI, analytics, error reports, marketing), legitimate interests, legal obligation; transfers. | L9 (done)              |
| Access, fix, delete, export        | ✅         | Export, in-app editing, and delete account.                                                                                                    | —                      |
| Cookie consent banner              | ➖ for now | The web app uses only essential storage (auth session); no analytics or ad cookies. Revisit if any client-side tracking is added.              | S23 (policy page only) |
| Report a breach within 72 hours    | 🟡         | [incident-response.md](incident-response.md) has the steps and clock; the owner fills in the contacts and the lead regulator.                  | L9 (done) + 👤         |

CCPA: below the thresholds; nothing to do beyond the above.

## Security

| Item                                                    | Status | Where / what's left                                                                                                                                                                                                                                                                        | Plan              |
| ------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| No secrets in code                                      | ✅     | Client bundle canary scan in CI (`pnpm secrets:scan`); public-env allowlist test. Repo history scan with gitleaks is still to come.                                                                                                                                                        | S31               |
| RLS on every table                                      | ✅     | RLS on all tables; the cross-user E2E suite (400 attempts, CI) finds no leaks. A CI check that fails on any table with RLS off is still to come.                                                                                                                                           | S33               |
| Permissions checked on the server                       | ✅     | Limits, entitlements, and ownership are enforced in SQL and edge functions (test 520: bypass attempts).                                                                                                                                                                                    | —                 |
| Real auth provider                                      | ✅     | Supabase Auth (email, Apple, Google).                                                                                                                                                                                                                                                      | —                 |
| HTTPS; secure, httpOnly cookies                         | 🟢     | HTTPS on Vercel and Supabase. The web session is in first-party cookies (Secure on HTTPS, SameSite=Lax), verified on the server with getUser before any app page renders. Not httpOnly, by design: the browser client reads them to call the API; the server never trusts them unverified. | S29 (done)        |
| Validate and sanitise input; sanitise rendered markdown | ✅     | zod on every boundary. No user markdown or HTML is rendered (no `dangerouslySetInnerHTML`); React escapes all text.                                                                                                                                                                        | S34 (`.strict()`) |
| Rate-limit login and paid API calls                     | 🟡     | Login lockout (10 failures / 15 min), daily AI spend cap, per-day parse and card limits. General per-user and per-IP rate limits with Retry-After are not done yet.                                                                                                                        | S10               |
| Dependencies updated: npm audit, Dependabot             | ✅     | Dependabot (weekly, grouped) for npm and GitHub Actions; a weekly `deno outdated` workflow for the edge functions; `pnpm deps:audit` in CI fails on high or critical production advisories and any for Next.js or React.                                                                   | L8                |
| Tauri permissions                                       | ➖     | No desktop app.                                                                                                                                                                                                                                                                            | —                 |
| Friendly errors; stack traces only in logs              | 🟡     | The UI shows plain messages; Sentry gets the details. Generic errors with a request id are still to come.                                                                                                                                                                                  | S33               |
| Back up the database and test a restore                 | 👤     | Steps are in launch-checklist §2 (PITR plus a restore drill); has to be done on the real project.                                                                                                                                                                                          | 👤                |
| Security review of the whole codebase                   | ✅     | [security-audit.md](security-audit.md) (S1–S34, then the L10 pass over L1–L9: two fixes, listed there), the cross-user suite, and the browser, Lighthouse, and accessibility job in CI.                                                                                                    | L10               |

## Accessibility (WCAG 2.2 AA)

| Item                                                      | Status | Where / what's left                                                                                                                                                                                                                                                              | Plan      |
| --------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Contrast 4.5:1 / 3:1 in both themes                       | ✅     | Token contrast tests (`packages/tokens`); vetted course palette; axe on every web screen.                                                                                                                                                                                        | —         |
| Never colour alone                                        | ✅     | Overdue carries a word and an icon; courses always show their code.                                                                                                                                                                                                              | —         |
| 200% text without breaking                                | ✅     | rem-based type; checked in the a11y audit ([accessibility.md](accessibility.md)).                                                                                                                                                                                                | —         |
| Alt text                                                  | ✅     | Decorative icons are `aria-hidden`; no meaningful images without alt.                                                                                                                                                                                                            | —         |
| Respect reduce motion                                     | ✅     | Web CSS honours `prefers-reduced-motion`. Mobile reads the system setting (`useReduceMotion`): no tab, sheet, or screen animations, and swiped rows don't spring back.                                                                                                           | L1        |
| Keyboard only, focus never hidden                         | ✅     | Skip link, route focus, visible rings, and a keyboard calendar grid; the sticky app bar uses scroll padding.                                                                                                                                                                     | —         |
| Tap targets ≥ 24 px (aim for 44)                          | ✅     | 48 px minimum by design rule.                                                                                                                                                                                                                                                    | —         |
| Drag actions have a button alternative                    | ✅     | The only drag is the syllabus dropzone, which also has a file button.                                                                                                                                                                                                            | —         |
| Timer can be paused; end alert has sound, vibration, text | 🟡     | Pause works; the end is announced and shown as text. Web: a generated chime and, if allowed, a notification when the tab is hidden. Mobile: vibration. Still missing: a local notification when the app is in the background (needs `expo-notifications` and a new store build). | L4        |
| No time limits on quizzes                                 | ✅     | The weekly practice quiz has no timer.                                                                                                                                                                                                                                           | —         |
| Real HTML elements                                        | ✅     | Semantic landmarks, headings, buttons, labels.                                                                                                                                                                                                                                   | —         |
| Visible labels; errors say how to fix                     | ✅     | `TextField` / `CheckboxField` with labels and described errors.                                                                                                                                                                                                                  | —         |
| Login with no puzzle; paste and password managers allowed | ✅     | No CAPTCHA; `autocomplete` set; paste allowed.                                                                                                                                                                                                                                   | —         |
| Help and settings in the same place                       | ✅     | Settings sits at the bottom of the sidebar, rail, and tab bar on every screen.                                                                                                                                                                                                   | —         |
| `lang="en"`, plain language                               | ✅     | `app/layout.tsx`.                                                                                                                                                                                                                                                                | —         |
| axe / Lighthouse on every screen                          | ✅     | In CI (the "Browsers, Lighthouse, and accessibility" job): `pnpm a11y` (axe, keyboard, 48 px targets, reflow, third parties on every route, both themes) and `pnpm lighthouse` on key routes.                                                                                    | L7        |
| VoiceOver and TalkBack, 10 minutes each                   | 👤     | Needs a person with devices. The mobile screens (L1) are built with labels, roles, and announcements for start, pause, finish, and saves.                                                                                                                                        | 👤        |
| Accessibility statement with a contact                    | ✅     | Public `/accessibility` page with known limitations and a reply time; linked in the footer.                                                                                                                                                                                      | L6 (done) |

## Design and UX

| Item                                                               | Status | Where / what's left                                                                                                                                                                                                                                                                                                            | Plan   |
| ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| 320 px to wide, no sideways scroll                                 | ✅ web | Checked at 320/375/768/1024/1440 in the a11y audit.                                                                                                                                                                                                                                                                            | —      |
| Bottom bar / rail / sidebar                                        | ✅     | Web shell done. Mobile: bottom tabs on phones, a navigation rail on tablets (600 pt and wider).                                                                                                                                                                                                                                | L1     |
| Safe areas                                                         | ✅     | `env(safe-area-inset-*)` on web; `useSafeAreaInsets` on mobile.                                                                                                                                                                                                                                                                | —      |
| Portrait and landscape on tablets                                  | ✅     | `app.json` orientation `default`; content keeps a readable width, and metric cards and course cards reflow to 2 or 3 columns.                                                                                                                                                                                                  | L1     |
| Light and dark, following the system                               | ✅     | Semantic tokens; `userInterfaceStyle: automatic`.                                                                                                                                                                                                                                                                              | —      |
| Body 16 px, lines ≤ 75 characters                                  | ✅     | Body 16 px; content max width keeps text columns short.                                                                                                                                                                                                                                                                        | —      |
| One accent, one font, 8 px spacing                                 | ✅     | Design tokens.                                                                                                                                                                                                                                                                                                                 | —      |
| Empty states that say what to do                                   | ✅     | `EmptyState` on every list screen.                                                                                                                                                                                                                                                                                             | —      |
| Loading states and instant feedback                                | ✅     | Skeletons and pending buttons.                                                                                                                                                                                                                                                                                                 | —      |
| Undo for deletes instead of "Are you sure?"                        | ✅     | Course and assignment deletes (web and mobile) hide the row and show "Deleted … Undo" for 10 s, paused while hovered or focused; the delete runs after the window, when the page or app is hidden, or when the screen closes. Account deletion keeps its typed confirmation (irreversible). Cards have no list UI yet.         | L3     |
| Autosave; never lose work                                          | ✅     | Timer state survives reloads. The syllabus review draft is kept on the device (validated, 14-day expiry) and restored; the web warns before leaving with unsaved review edits or a typed score; typed scores survive closing the score dialog. There is no notes editor yet.                                                   | L3     |
| Works offline, with a clear sign when sync is paused               | ❌     | Web and mobile both need the network.                                                                                                                                                                                                                                                                                          | L2     |
| Onboarding of 3 screens max, skippable                             | ✅     | Web: three steps, each with Skip (keeps the defaults). Mobile: two steps (name; study time) with Skip, shown to new accounts after the age check; it saves the phone's timezone, which mobile sign-up also sends.                                                                                                              | L5     |
| Keyboard shortcuts on PC; swipes on phone with button alternatives | ✅     | Web: `g` then t/c/o/f/s for the five destinations, `f` start focus, `u` upload, `?` the list (also a Shortcuts button in the rail and sidebar), ignored while typing, and switchable off (WCAG 2.1.4). Mobile swipes (task rows: done, focus, add score; calendar: change week) each have a button and a screen-reader action. | L5, L1 |
| Notifications only when asked; easy to turn off                    | ✅     | Opt-in during onboarding and in Settings; per-kind toggles; quiet hours.                                                                                                                                                                                                                                                       | —      |
| No dark patterns                                                   | 🟡     | The streak is phrased neutrally ("Focus today to start one"), and cancel is one click in Settings. Still to do: an audit of all copy and flows.                                                                                                                                                                                | S26    |
| Break reminders in the focus timer                                 | ✅     | Optional ("Suggest breaks"): 5 minutes after a session of 20+ minutes, 15 after every fourth that day; a break countdown that chimes or buzzes at the end. Web and mobile.                                                                                                                                                     | L4     |

## App stores

| Item                                                      | Status | Where / what's left                                                                                                                                                                                                                            | Plan                         |
| --------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Privacy policy link in the store and the app              | 🟡     | In-app link done; the store link needs the published URL.                                                                                                                                                                                      | 👤                           |
| In-app account deletion (Apple 5.1.1(v), Play)            | ✅     | Settings on both apps. Play also needs a web deletion link: `/settings` works signed in; add a signed-out request page.                                                                                                                        | L6                           |
| Privacy label / Data safety form                          | 👤     | Answers are drafted in launch-checklist §5.                                                                                                                                                                                                    | 👤                           |
| More than a website in a wrapper (4.2)                    | ✅     | Native Today, Calendar, Courses, Course detail, Focus, and Stats screens on the same API as the web, plus syllabus paste/link with review, add assignment, scores, and targets. A guard test fails if a tab goes back to a placeholder.        | L1                           |
| Sign in with Apple alongside Google (4.8)                 | ✅     | S1.                                                                                                                                                                                                                                            | —                            |
| Finished build plus a reviewer demo account (2.1)         | 🟡     | `pnpm reviewer:seed` creates or refreshes the review account (3 courses mid-term, graded work, two weeks of focus). 👤 Run it against production before each submission and put the login in the review notes.                                 | L1 (seeded reviewer account) |
| Kids category rules                                       | ➖     | Don't list in Kids if 13+.                                                                                                                                                                                                                     | —                            |
| Latest Android API level                                  | ✅     | Expo SDK 57 targets the current required level.                                                                                                                                                                                                | —                            |
| Content rating questionnaire                              | 👤     | Play Console.                                                                                                                                                                                                                                  | 👤                           |
| AI features: disclose and get consent before sending data | ✅     | In-app prompt names Anthropic, what's sent and why, before the first request; revocable in Settings (web and mobile); enforced in the database (SPA15). The mobile syllabus screen shows the same prompt before anything is sent (guard test). | L2-AI (done)                 |
| Families policy                                           | ➖     | Only if the app targets kids.                                                                                                                                                                                                                  | —                            |
| 14-day closed test (new personal Play accounts)           | 👤     | Plan for it in the timeline.                                                                                                                                                                                                                   | 👤                           |
| Code signing and notarisation                             | ➖     | No desktop installers; EAS signs the mobile builds.                                                                                                                                                                                            | —                            |
| Policy and terms in the website footer                    | 🟡     | Linked from settings and sign-up; the public footer and business info are still to come.                                                                                                                                                       | S28                          |

## Code, content, and licenses

| Item                                             | Status | Where / what's left                                                                                                                            | Plan                                                |
| ------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| License list and an open-source licenses screen  | ❌     | No screen; no license check in CI.                                                                                                             | S27                                                 |
| Care with GPL/AGPL                               | ❌     | Nothing checks for them.                                                                                                                       | S27 (CI allowlist: MIT, Apache-2.0, BSD, ISC, OFL…) |
| Code from tutorials                              | 👤     | Nothing was pasted from outside sources in this build.                                                                                         | —                                                   |
| AI output and ownership                          | 👤     | Commits and design docs are the record; check your AI tool's terms.                                                                            | 👤                                                  |
| Fonts licensed for apps                          | 🟡     | Roboto (OFL) via Google Fonts; self-hosting is still to come.                                                                                  | S13                                                 |
| Icons and images licensed                        | ✅     | Icons are Material Symbols (Apache-2.0), inlined as SVG. Credit them on the licenses screen.                                                   | S27                                                 |
| Timer sounds royalty-free                        | ✅     | The chime is generated at play time with Web Audio (two sine notes, `CHIME` in `@studypulse/core/screens`); there is no audio file to license. | L4                                                  |
| Name and logo don't copy a brand                 | 👤     | Search "StudyPulse" in the app stores and USPTO before launch.                                                                                 | 👤                                                  |
| No competitor names in the store listing         | 🟡     | In-app "Export for Anki / Quizlet" describes a file format, which is fine. Keep those names out of the store listing text.                     | 👤                                                  |
| Users own content; no uploading others' material | ✅     | Terms §"Your content".                                                                                                                         | —                                                   |
| Report copyrighted content                       | 🟡     | No public sharing yet, so no report flow is needed. A DMCA page is planned.                                                                    | S17                                                 |
| AI disclosure, consent, "can be wrong" warning   | ✅     | The consent prompt says AI can make mistakes; the review screen flags low-confidence items before anything is saved.                           | L2-AI (done)                                        |

## Final pre-launch checks

| Item                                                                 | Status                                                                                                                                                                                                             | Plan |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- |
| Test on phone, tablet, PC; Chrome, Safari, Firefox                   | ✅ `pnpm browsers` runs sign-in, every screen, calendar keys, shortcuts, the focus timer, and Add score in Chromium, Firefox, and WebKit at desktop and phone sizes, in CI. 👤 Still worth a pass on real devices. | L7   |
| 5 first-time users try it unaided                                    | 👤                                                                                                                                                                                                                 | 👤   |
| Lighthouse 90+ (accessibility and performance)                       | ✅ CI fails under 90 on any key route, phone or desktop (median of 3 runs). Measured 96–100 performance, 100 accessibility after fixing footer and calendar layout shifts.                                         | L7   |
| Airplane mode mid-session loses nothing                              | ❌                                                                                                                                                                                                                 | L2   |
| Sentry on, with no personal data                                     | ✅ `scrubEvent` redacts headers, bodies, and cookies; no replay. S31 adds logger redaction.                                                                                                                        | S31  |
| Support email and an in-app feedback link                            | ❌ the placeholder email is not in the app                                                                                                                                                                         | S19  |
| Policy, terms, accessibility statement, licenses all live and linked | 🟡 policy, terms, accessibility, and deletion pages linked in the footer; the open-source licenses screen is still to come                                                                                         | S27  |
| Store screenshots, description, age rating accurate                  | 👤                                                                                                                                                                                                                 | 👤   |
| Version, changelog, update plan                                      | ✅ `CHANGELOG.md` with the release steps: version in `app.json`, EAS build numbers, migrations first, `eas update` for JavaScript-only fixes                                                                       | L8   |
| Lawyer review before kids' data, payments, or schools                | 👤 **Payments are in v1 (Stripe, RevenueCat)**, so this applies.                                                                                                                                                   | 👤   |

## New build items from this audit

These join S9–S34, in this order after S10, because L1 and L2-AI block store approval.

- **L1 Mobile screens (done, 2026-09-27; PDF and photo upload on mobile still to do):**
  - Build Today, Calendar, Courses, Course detail, Focus, and Stats in Expo on the same
    API.
  - Tablet landscape; reduce motion; swipe actions with button alternatives.
  - A seeded reviewer demo account.
- **L2-AI AI consent (done, 2026-09-26):**
  - Ask once before the first syllabus parse or card generation. Say what is sent to the
    AI provider and that results can be wrong.
  - Record the consent with a timestamp; the server refuses AI work without it.
  - Can be revoked in Settings.
- **L2 Offline:**
  - Cache reads for offline use (Today, Calendar, Courses).
  - Queue timer sessions and score edits while offline, with a visible "Offline — changes
    will sync" banner.
  - An airplane-mode test.
- **L3 Undo and autosave (done, 2026-09-27):**
  - Use undo toasts, not confirmations, for course, assignment, and card deletes (soft delete, then purge).
  - Autosave notes and score entry; warn on unsaved changes.
- **L4 Timer end and breaks (done, 2026-09-27; mobile background notification still to do):**
  - End alert with a generated chime (Web Audio, no asset license), vibration on mobile,
    and a notification when the tab is hidden.
  - Optional break reminders (5 min after 25, a longer one after 4 sessions).
- **L5 Onboarding and shortcuts (done, 2026-09-27):**
  - A Skip button on every onboarding step.
  - App-wide keyboard shortcuts (`g t` Today, `f` start focus, `?` help) with a
    discoverable list.
- **L6 Public pages (done, 2026-09-26):**
  - Accessibility statement with a contact.
  - Signed-out account-deletion request page (Play).
  - Footer links.
- **L7 Browser matrix and Lighthouse (done, 2026-09-27):**
  - Playwright WebKit and Firefox projects.
  - Lighthouse CI on key routes with budgets (≥ 90 accessibility and performance).
- **L8 Dependency hygiene (done, 2026-09-27):**
  - Dependabot for npm and Actions; a weekly `deno outdated` workflow for Deno (Dependabot doesn't read `deno.json`).
  - A `pnpm audit --prod` CI step (high and above fail).
  - `CHANGELOG.md`.
- **L9 Compliance docs (done, 2026-09-26; owner fills names and contacts):**
  - Written information security program, retention schedule, and lawful basis per
    purpose (for the privacy policy).
  - Breach runbook (72-hour regulator notice).
- **L10 Final security review** after S9–S34 and L1–L9 (done, 2026-09-27; see security-audit.md).

## What needs you (not code)

1. **Decide the age position.** 13+ is recommended; it's already in the terms, and S12
   adds the sign-up gate.
2. **Fill the legal placeholders.** Company legal name, support email, jurisdiction. Then
   have a lawyer review the privacy policy and terms; payments make this necessary.
3. **Store consoles.** Privacy label, Data safety form, content rating, and the 14-day
   closed test if the Play account is a new personal one.
4. **People.** Run a backup restore drill, 10-minute VoiceOver and TalkBack passes, and a
   5-person first-use test.
5. **Brand search.** "StudyPulse" in the app stores and USPTO.
