# StudyPulse security audit

Scope: RLS policies and grants, SECURITY DEFINER functions, storage, every edge function's
authentication, secrets handling, and the web app's HTTP surface. Audited against the local
stack built from `supabase/migrations` (38 SQL test files, 413 tests passing).

The database checks are now permanent: `supabase/tests/database/360_security_invariants.test.sql`
fails if any of them regresses (a table without RLS, a policy open to `anon`/`PUBLIC` or
unconditionally true, an UPDATE policy without `WITH CHECK`, a view that bypasses RLS, table
grants to `anon`, a SECURITY DEFINER function without a pinned `search_path` or callable
anonymously, or a public storage bucket).

## Fixes needed

| #   | Severity | Finding                                                                                                                                                                                     | Status                                                                                                                                                                                                                                                          |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **High** | Account deletion didn't stop web billing. `delete-account` predates payments, so a deleted user's Stripe subscription kept charging them, and their Stripe customer (email, card) was kept. | **Fixed:** deletion now deletes the Stripe customer first (cancels subscriptions, removes payment methods); if Stripe is unreachable or unconfigured, nothing is deleted and the user can retry.                                                                |
| 2   | Medium   | Account deletion removed Canvas tokens from Vault but left them valid at the school's Canvas.                                                                                               | **Fixed:** tokens are revoked at Canvas first (best effort; Vault copies are deleted regardless).                                                                                                                                                               |
| 3   | Medium   | The web app sent no security headers (no CSP, clickjacking protection, or HSTS).                                                                                                            | **Fixed:** CSP limited to self, Supabase, and Sentry; `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, Referrer-Policy, Permissions-Policy, HSTS in production; `X-Powered-By` removed.                                                                  |
| 4   | Low      | The data export (`export-data`) omitted organization memberships and Canvas connections.                                                                                                    | **Fixed:** both added (own rows only; admins' RLS also shows their roster, so the export filters to the user).                                                                                                                                                  |
| 5   | Medium   | Production Auth settings are local defaults: 6-character passwords, no email confirmation, no CAPTCHA. Every account can spend AI parses, so bot signups cost money.                        | **To do in the production project:** minimum password length 10 with leaked-password protection; enable email confirmations; enable CAPTCHA (Turnstile or hCaptcha) on signup and password reset; set Site URL and redirect allowlist to the real domains only. |
| 6   | Low      | Edge functions answer CORS with `Access-Control-Allow-Origin: *`. Auth is a bearer token (no cookies), so this doesn't enable CSRF, but it's broader than needed.                           | **To do:** restrict to `APP_URL` in production (mobile apps don't use CORS).                                                                                                                                                                                    |
| 7   | Low      | `org_focus_summary` hides weeks with fewer than 3 students, but an admin comparing reports before and after one student opts out could infer that student's weekly total by subtraction.    | **To decide:** round weekly totals to the nearest 5 hours, or count only students opted in for the whole reporting period.                                                                                                                                      |
| 8   | Low      | CSP allows `'unsafe-inline'` scripts (Next.js inline bootstrap).                                                                                                                            | **To do (later):** per-request nonces via middleware, then drop `'unsafe-inline'`.                                                                                                                                                                              |
| 9   | Info     | `pg_graphql` is exposed (`graphql_public`). It honors RLS, but nothing uses it.                                                                                                             | **Optional:** disable the extension to shrink the API surface.                                                                                                                                                                                                  |

## What was checked and holds

**Row-level security.** Every public table has RLS. Users reach only their own rows; child tables
check ownership through their course. No policy targets `anon`/`PUBLIC` or is unconditionally
true, and every UPDATE policy has `WITH CHECK`, so rows can't be reassigned to another user.
Service-only tables (`notification_dedupe`, `replan_requests`, `billing_customers`,
`billing_events`, `lms_oauth_states`, `lms_dismissed_items`) have RLS on, no policies, and no
client privileges. Both views (`assignment_grade_shares`, `weekly_focus_by_course`) are
`security_invoker`, so RLS applies through them. `anon` has no table privileges.

**Column-level exposure.** Clients can't read `lms_institutions.client_secret_id`,
`lms_connections` token references, or `organizations.join_code` (admins get it from
`rotate_join_code`). Clients can't set `plan_tier`, and Canvas provenance
(`external_id`, `lms_connection_id`, `user_edited_fields`) is enforced read-only by trigger.

**SECURITY DEFINER functions.** All pin `search_path = ''`; none is callable by `anon`. The 15
callable by signed-in users each check the caller (`auth.uid()`), covered by SQL tests.
Functions in `private` are not exposed by the API (`api.schemas` is `public`,
`graphql_public`).

**Storage.** One bucket (`syllabi`), private, 20 MB limit, PDF/image types only. Users can
read, upload, and delete only under their own `<user id>/` folder; there is no UPDATE policy,
so files can't be overwritten.

**Edge functions.**

| Function                                                                                               | Caller           | How it's authenticated                                                 |
| ------------------------------------------------------------------------------------------------------ | ---------------- | ---------------------------------------------------------------------- |
| upload-syllabus, plan-study, export-cards, export-data, delete-account, stripe-checkout, stripe-portal | App              | Supabase JWT (gateway + `requireUser`)                                 |
| canvas-oauth `/start`, `/disconnect`; canvas-sync (on demand)                                          | App              | `requireUser`                                                          |
| canvas-oauth `/callback`                                                                               | Browser redirect | One-time state: 32 random bytes, stored hashed, single use, 10 minutes |
| send-reminders, send-email-digests, nightly-replan, canvas-sync (cron)                                 | pg_cron          | `x-cron-secret`, constant-time compare; secret kept in Vault           |
| stripe-webhook                                                                                         | Stripe           | `Stripe-Signature` HMAC over the raw body, 5-minute replay window      |
| revenuecat-webhook                                                                                     | RevenueCat       | Fixed Authorization header, constant-time compare, 24+ characters      |
| calendar-feed                                                                                          | Calendar apps    | 256-bit token in the URL, stored as a SHA-256 hash                     |
| email-unsubscribe                                                                                      | Email link       | HMAC-signed token; GET never unsubscribes (link scanners), POST does   |

Outbound requests are constrained: syllabus URL imports block private/reserved IPs (SSRF),
web push goes only to known push-service hosts, Canvas URLs must be public https origins,
and Canvas pagination never follows a link to another origin with the token.

**Secrets.** No keys or env files are committed (`git ls-files`, pattern scan). Every variable
is validated at startup; the only client-bundled values are public by design (Supabase URL and
anon key, Sentry DSN, VAPID public key, RevenueCat public SDK keys). Canvas tokens and
client secrets live only in Vault. Sentry events are scrubbed of cookies and sensitive
headers and fields, and logs never include tokens or emails.

## Before launch (operator checklist)

- Apply fix #5 (Auth settings, CAPTCHA) in the production Supabase project.
- Rotate every secret that was ever used in a shared or test environment.
- Set `CRON_SECRET`, `EMAIL_UNSUBSCRIBE_SECRET`, `REVENUECAT_WEBHOOK_AUTH` to fresh random
  values, and store `project_url` / `cron_secret` in production Vault.
- Enable Supabase point-in-time recovery, and restrict the database to SSL connections.
- Turn on GitHub secret scanning and Dependabot alerts for the repository.

## Launch safety S3–S6 (September 25, 2026)

### S3. Secrets in client bundles

- CI job "Client bundle secret scan" (`pnpm secrets:scan`) builds the web app and the iOS
  and Android bundles with a unique canary in every server-only variable
  (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, webhook secrets,
  `VAPID_PRIVATE_KEY`, `GOOGLE_CLIENT_SECRET`, `CRON_SECRET`, deploy tokens, ...), then
  searches everything a client downloads for the canaries and for real key shapes
  (service-role JWTs, `sk_live_`/`sk_test_`, `whsec_`, `sk-ant-`). Result: clean.
- `packages/core/src/launch/public-env.test.ts` fails if any `NEXT_PUBLIC_`/`EXPO_PUBLIC_`
  variable outside a vetted allowlist appears in code or `.env.example`; each allowlisted
  variable has the reason it's safe to ship (anon key, public SDK keys, DSN, URLs).

### S4. Pro-gated and limited actions

No check exists only in client code. Clients never decide entitlement; they render the
server's answer (`billing_status`, `parse_limit_reached`, `course_limit_reached`).

| Limit                                            | Enforced by                                                    | Test         |
| ------------------------------------------------ | -------------------------------------------------------------- | ------------ |
| 3 active courses on Free                         | `enforce_course_limit` trigger (insert and un-archive)         | 310, 520     |
| 3 parses a day, PDF/text only on Free            | parse-limit trigger on `syllabus_uploads`; OCR in `extract.ts` | 110, 520     |
| 5 / 50 card generations a day                    | `enforce_card_generation_limit` trigger                        | 410          |
| Pro status                                       | `is_pro()` from `subscriptions` (service-role writes only)     | 310, 520     |
| Student discount                                 | `stripe-checkout` (confirmed academic email)                   | stripe tests |
| Plan tier, upload status, AI usage, billing rows | no client write grants                                         | 520          |

### S5. Sign-out

- Web and mobile sign out with `scope: "global"` (every device's refresh tokens revoked),
  falling back to a local sign-out when offline, and clear StudyPulse's own storage.
- **Fixed:** access tokens are JWTs that kept working for up to an hour after sign-out
  (verified: a signed-out token still read `/rest/v1/courses`). PostgREST now runs
  `request_guard.require_live_session()` before every request and refuses tokens whose
  session no longer exists (`401 session ended`). Tests: 530 and `lib/sign-out.test.ts`.

### S6. Account enumeration and auth rate limits

- The apps show the same words for a wrong password, an unknown email, and an unconfirmed
  email; sign-up and reset always answer "if ... we've sent" (`@studypulse/core/auth`).
- API level, verified locally: sign-in and reset are identical for known and unknown
  emails. Per IP: 30 sign-in/sign-up requests per 5 minutes. Per email: one confirmation
  or reset email a minute, and 10 wrong passwords in 15 minutes lock password sign-in
  for 15 minutes (Auth hook; the locked answer is identical to a wrong password). Test 540.
- **Remaining gap:** a direct call to the auth API's sign-up endpoint with a registered
  email gets `422 User already registered` (Supabase Auth behavior). Mitigated by the
  per-IP limit; close it with CAPTCHA, and fully with a server-side sign-up endpoint.

## Cross-user access suite

`supabase/tests/e2e/cross_user.test.ts` runs in CI (the `cross-user` job). User A, and C as an
org admin, attack user B's data through every table, view, RPC, edge function, storage
path, ICS token, export, and link. The first run flagged these paths:

| Path                                           | Finding                                                                                      | Fix                                                                                                                      |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `flashcards` insert/update                     | A card on A's course could point at B's assignment                                           | Composite FK `(assignment_id, course_id)` on flashcards and card_generations (migration 006000, test 570)                |
| `register_push_token`                          | Registering B's device token moved B's row to A and returned B's row id, device id, and keys | The device still moves to the new account, but as a new row; B's row is deleted and nothing of it is returned (test 250) |
| `create_organization`, `rotate_calendar_token` | Flagged by the differential check                                                            | False positive: the answers are random; the suite now compares two random runs first                                     |
| `organization_roster`                          | Admin sees member user ids                                                                   | By design (needed to manage members); the suite checks that nothing else of B's appears                                  |

Current result: 400 attempts, 0 failed.

## S9: Bounded retries and provider circuit breakers

Every call to Anthropic, Stripe, Expo, Resend, Google, and PostHog goes through
`providerFetch` (`supabase/functions/_shared/resilience.ts`, built on
`packages/core/src/resilience`).

- **Retries.** At most 3 attempts per request, with exponential backoff and full jitter
  (250 ms base, 4 s cap). A Retry-After of 10 s or less is waited out; a longer one fails
  the call. The Anthropic SDK's own retries are off, so retries don't multiply. Before,
  one AI call could make up to 8 requests.
- **What gets repeated.** A request is repeated only when repeating it can't do something
  twice:
  - it's idempotent: GET, PUT, or DELETE; Stripe and Resend requests that carry an
    Idempotency-Key; AI completions; PostHog events, which carry their own uuid; or
  - the provider answered 408, 429, 503, or 529, meaning it didn't process the request.

  An Expo push send that fails with a 500 or a dropped connection is not repeated, so no
  student gets the same reminder twice.

- **Circuit breaker.**
  - After 5 failed calls in a row to a provider, every function stops calling it for
    5 minutes.
  - Callers get `503 provider_unavailable` with a Retry-After header. This is logged as a
    warning, not reported to Sentry.
  - After the pause, one trial call decides whether to close the breaker or pause again.
  - The pause is shared between workers and cron runs through `private.provider_circuits`,
    which each worker reads at most every 30 s. Pauses are capped at 15 minutes.
- **Not covered.** Web push and Canvas talk to many different hosts, so one breaker per
  provider would let a single bad host pause everyone. They keep their existing
  per-request handling.
- **Tests.** Core unit tests (17), the handler's 503 mapping (Deno), SQL test 580, and a
  live check that a breaker opened in one worker stops a fresh worker from calling the
  provider.

## S10: Rate limits and signed URLs

- **Every edge function** has a per-IP limit, checked in `createHandler` before the
  function runs. Functions users call also have a per-user limit, checked in `requireUser`
  after the token is verified, so a forged token can't use up someone else's allowance.
- **Limits live in one table** (`FUNCTION_LIMITS` in `supabase/functions/_shared/rate-limit.ts`),
  and a test fails if a function has no entry. Examples:
  - upload-syllabus and generate-cards: 10 per minute per user.
  - export-data: 10 per hour per user.
  - delete-account: 5 per hour per user.
  - Cron jobs and signed webhooks: 600 per minute per IP (their secret or signature is the
    real gate).
- **Over the limit:** `429 rate_limited` with Retry-After.
- **Counters** are shared by all workers (`public.rate_limit_hit`, fixed windows, service
  role only). IPs are stored only as SHA-256 hashes, and counters are deleted after a day.
  If the counter can't be reached, the request is allowed and a warning is logged.
- **Client IP.** In production the IP comes from Cloudflare's `cf-connecting-ip`, which a
  client can't set. The local stack falls back to `x-forwarded-for`, which a client can
  spoof.
- **ICS feed:** also limited to 60 requests per hour per token, whatever the IP.
- **Syllabus files:** the bucket stays private (SQL test 590 checks it). The only signed
  links, in the data export, now expire after 15 minutes instead of an hour.
- **Tests:** Deno (coverage of every function, IP header order), SQL test 590, and a live
  run showing each limit returning 429:
  - per user, across 10 IPs;
  - per IP, with a second IP unaffected;
  - per ICS token, across many IPs.

## S11–S12: Easy cancellation, one-click unsubscribe, and the age gate

**S11**

- Web: Settings → Manage subscription opens the Stripe portal in one click.
- App Store and Google Play subscriptions have a direct button on web and in the mobile
  app, linking to that store's subscriptions page. Before, web only named the store.
- Every email (the digest is the only one we send) carries `List-Unsubscribe` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, signed with
  `EMAIL_UNSUBSCRIBE_SECRET`. Unsubscribing works without signing in. A GET only shows a
  confirm button, so link scanners can't unsubscribe anyone.

**S12**

- **Email sign-ups** ask for birth month and year, neutrally and with the reason.
  - Under 13 is refused in the app. The `before_user_created` auth hook refuses it again
    with a clear message, and a trigger on `auth.users` refuses it if the hook is off.
  - The birth month is removed before the row is saved; only `age_confirmed_at` is kept.
  - Age is computed as if the birthday were the last day of the month.
- **Apple and Google sign-ups** can't carry a birth month, so they start unconfirmed.
  - The first screen asks (web onboarding, mobile tabs).
  - Under 13: `confirm_age` deletes the account on the spot.
  - Until the age is confirmed, the account can't create a course or an upload, or finish
    onboarding (`SPA14`).
- **No second try:** a blocked attempt is remembered on the device for 24 hours.
- **Existing accounts:** marked confirmed at migration.
- **Tests:** SQL test 600 (21 checks), core age tests (property: nobody under 13 passes;
  leap-year parity with SQL), web tests for sign-up and the onboarding age step, and a
  live check against the Auth server:
  - no birth month: 400;
  - under 13: 403;
  - adult: 200, with nothing stored but the confirmation time.
- The privacy policy's Children section describes all of this.

## S13–S14: No third-party requests before consent, no session replay

- **Fonts.** The web app uses the Roboto or system font stack from the design tokens and
  loads no web fonts, and the CSP only allows fonts from our own origin. The mobile app
  uses system fonts.
- **Third-party requests, listed.** The a11y audit now records every request a real
  browser makes, on every screen (signed out and signed in, phone to desktop, light and
  dark). Result: **none**. Only the app's own origin and Supabase are contacted.
  - Sentry browser errors now go through our own `/monitoring` route (`tunnelRoute`), so
    Sentry is gone from the CSP `connect-src`.
  - PostHog runs only server-side, from the analytics outbox.
  - Stripe is only reached by redirecting to Checkout or the portal, after the user clicks.
- **Session replay** is off in every Sentry SDK (`replaysSessionSampleRate` and
  `replaysOnErrorSampleRate` are 0), and there is no PostHog client SDK, so nothing is
  recorded. The privacy policy says so, and says consent, full masking, and a policy
  update come first if that ever changes.
- **Guard test.** `packages/core/src/launch/third-party.test.ts` fails if app code adds
  hosted fonts, Google Analytics or Tag Manager, a client PostHog SDK, or any replay
  integration. It also checks the CSP.

## S15: Marketing email kept apart from transactional email

- **Every email kind is classified** in `packages/core/src/notify/email-policy.ts`
  (`EMAIL_KINDS`).
  - Transactional: the daily digest the student turned on, subscription confirmations,
    renewal reminders, and account email.
  - Marketing: product news and tips.
- **Marketing is opt-in.** `notification_prefs.marketing_emails` is off by default. Opting
  in stamps `marketing_opt_in_at` (a trigger, so users can't forge it), and opting out
  clears it. The toggle is in web Settings.
- **`planMarketingEmail` is the only way to build a marketing email.** It refuses to build
  one without `COMPANY_POSTAL_ADDRESS` (a PO box is fine) or an https unsubscribe link,
  adds both to the footer plus the RFC 8058 one-click headers, and returns nothing for
  students who haven't opted in.
- **Unsubscribe is separate and immediate.** Links are signed per scope (`digest` or
  `marketing`), so one can't be used for the other. Leaving marketing never turns off
  reminders. `unsubscribe_marketing` takes effect at once, and senders read the
  preference right before each send.
- **Nothing is sent as marketing yet.** Any future campaign must go through
  `planMarketingEmail`.
- **Tests:** core tests (footer, headers, opt-in, token scopes) and SQL test 610.

## S16: Renewal terms at every subscribe button, and in email

- **One source for the terms:** `packages/core/src/billing/terms.ts` (`subscriptionTerms`)
  covers the price, how often it's charged, that it renews until canceled, and how to
  cancel.
- **Upgrade page.**
  - The header (whose button starts checkout) and the checkout panel both show the live
    price from Stripe (`GET /stripe-checkout`, cached 10 minutes per worker), the
    frequency, the renewal line, and the cancel instructions.
  - The Continue button is `aria-describedby` the terms.
  - Each billing option shows its own price and frequency.
  - If prices can't be loaded, the page still states the terms and says the price is
    shown at checkout.
- **Mobile paywall:** not built yet (L1). It must use `subscriptionTerms` with the store
  price.
- **Emails,** both transactional:
  - `invoice.paid` with `billing_reason: subscription_create` sends a confirmation with
    the same terms, the next charge date, a link to manage or cancel, and the support
    address.
  - `invoice.upcoming` on a yearly price sends a renewal reminder. The Stripe dashboard
    fires it at least 7 days ahead (launch checklist).
  - Resend's idempotency key is the Stripe event id, so a retried event never sends
    twice.
- **Tests:** core tests for terms and both emails; a web test that the terms sit next to
  the button and follow the chosen interval.

## S17: Copyright and takedowns

- `/copyright` (linked from the Terms) covers:
  - who to send a notice to (the designated agent, as bracketed placeholders);
  - the six elements of a DMCA notice;
  - what happens next, counter-notices, and the repeat-infringer policy.
- **Takedowns:** `public.takedown_content` (service role only) removes a reported upload
  (clears its text and marks it removed), flashcard, or link. It records every notice in
  `private.content_takedowns`, keeping the owner for repeat-infringer checks.
- **Operator script:** `scripts/takedown.mjs` also deletes the stored file and prints the
  account's takedown count, flagging 3 or more.
- **Runbook:** `docs/takedowns.md`.
- **Manual step:** register the DMCA designated agent with the US Copyright Office ($6,
  renewed every 3 years) and put the registered details on the page.
- **Tests:** SQL test 620, and a live run of the script against the local stack (file
  deleted, row updated, notice recorded).

## S18–S19: Refund policy, support address, statement descriptor

- **`/refunds`** matches the refund handling in `stripe-webhook`:
  - a full web refund ends Pro immediately and cancels the subscription;
  - a partial refund changes nothing;
  - App Store and Google Play refunds go through Apple and Google.
  - The refund window is left as a marked `[N]` for the owner to decide.
- **Where `/refunds` is linked:** the checkout panel on the upgrade page, the Terms,
  Settings → Legal, the sign-in page's legal links, and the mobile legal links.
- **Support address:** `supportEmail()` in core. Set it with `NEXT_PUBLIC_SUPPORT_EMAIL` /
  `EXPO_PUBLIC_SUPPORT_EMAIL` / `SUPPORT_EMAIL`; it defaults to `support@studypulse.app`.
  It's shown on:
  - the pricing (upgrade) page;
  - Settings;
  - the sign-in and legal pages (Terms, Privacy, Refunds);
  - the mobile legal links ("Contact support");
  - every billing email.
    It replaced the `[support email]` and `[privacy contact email]` placeholders.
- **Statement descriptor, Stripe public details, and receipts** are dashboard settings,
  listed in the launch checklist: `STUDYPULSE PRO`, the support email, and the refund URL.
- **Fixed:** the S16 price lookup used `/prices/…` instead of `/v1/prices/…` and would
  have failed against real Stripe. A test now pins the URL.

## S21: Terms of Service and acceptance records

- **`/terms` (version shown at the top)** covers:
  - what Free and Pro include, rendered from `PLAN_FEATURES`, the same values the database
    enforces;
  - the daily import limits (3 Free, 25 Pro, from `PARSE_LIMITS`);
  - fair use, including the AI daily cap;
  - a prominent section saying AI-read dates can be wrong and must be checked against the
    syllabus;
  - subscriptions, cancellation, and refunds;
  - a limitation of liability (greater of 12 months' fees or US $50).
- **`public.terms_acceptances`** records the user, version, context
  (`signup` / `checkout` / `reaccept`), and time:
  - Email sign-up sends `terms_version` with the account, and a trigger records it. Only
    the current version counts.
  - Apple and Google accounts accept on the first screen, next to the age question
    (`accept_terms`).
  - Checkout records it with the service role (`record_checkout_terms`) and puts
    `terms_version` on the Stripe session and subscription metadata.
  - `terms_current()` tells the apps whether to ask again after a version bump.
  - Users can read only their own records and can't write any.
- `TERMS_VERSION` (core) and `private.current_terms_version()` (SQL) must match; a core
  test and SQL test 630 check both.

## S20: Disputes and early fraud warnings

- **`charge.dispute.created`:**
  1. The webhook finds the account (charge → customer → `billing_customers`).
  2. It gathers evidence with `dispute_evidence_facts`: account email and name, Terms
     acceptances (S21), the last 20 sign-ins (time and browser, no IPs), and usage
     (courses, uploads, study sessions and minutes, first and last activity).
  3. It builds Stripe text evidence (`buildDisputeEvidence`): product description, service
     date, activity log, cancellation and refund policy disclosures as shown at checkout,
     and the Terms records.
  4. It stages the evidence on the dispute with `submit=false`, so the owner reviews it
     and adds the receipt before submitting.
  5. It records the dispute in `private.billing_disputes` (idempotent) and alerts the
     owner through Sentry and `ALERT_WEBHOOK_URL`. A Stripe retry doesn't alert twice.
- **Dispute rate:** each alert includes disputes ÷ paid invoices over the last 90 days,
  headed "dispute rate above 0.5%" when over the threshold (2 disputes in 200 payments is
  already 1%).
- **`radar.early_fraud_warning.created` (actionable):** the charge is fully refunded
  (idempotency key per warning), which ends Pro through the existing `charge.refunded`
  flow, and the owner is alerted.
- **Tests:** core tests (event mapping, evidence, rate), SQL test 640, and a live run of
  the real webhook against a fake Stripe server. That run checked: evidence posted with
  `submit=false`, the fraud refund posted, one alert per dispute, and no second alert on
  retry.

## S22: License agreement and counter-notices

- **`/eula`:** a short custom EULA. The app is licensed, not sold; no reverse engineering
  or redistribution; no warranty and a liability limit; Apple and Google as third-party
  beneficiaries with no support duty; the export clause. It's linked from Settings and
  the mobile legal links, and the launch checklist has the App Store Connect and Play
  steps.
- **`/copyright`** now has a "If your upload was removed" counter-notice section listing
  what to include and the 10-to-14-business-day restore timeline.

## S23–S24: Cookie policy, consent banner, and consent records

- **`/cookies`** is rendered from `STORAGE_INVENTORY` and `OPTIONAL_PROCESSING` in
  `@studypulse/core/privacy`:
  - no cookies at all;
  - the essential storage keys: session, sign-in verifier, the choice itself, focus
    timer, age-gate memory, push service worker;
  - the two optional kinds of processing (product analytics and browser error reports),
    with a form to change them.
- **Banner:** for visitors from the EU, EEA, UK, or Switzerland, or from an unknown
  country (`/api/consent-region`, from the host's geolocation header).
  - Reject and Accept have the same style and size, side by side.
  - Nothing optional runs before a choice.
  - Browser Sentry now starts only when error reports are allowed (`lib/error-reporting.ts`;
    `instrumentation-client.ts` no longer initializes it).
- **Analytics are server-side (PostHog):**
  - `profiles.analytics_allowed` gates the outbox with a trigger: events for students who
    haven't allowed analytics are never stored.
  - Withdrawing deletes events that haven't been sent yet.
  - In the EU and UK, a signed-in student who hasn't chosen is set to opted out.
- **S24 form audit:** no pre-checked boxes anywhere (sign-up, onboarding, upgrade,
  settings, age step). Marketing email opt-in is separate from accepting the terms and
  off by default. Each consent is stored with a timestamp and policy version:
  - Terms: `terms_acceptances`.
  - Marketing email, analytics, and error reports: `consent_log`, append-only, with the
    source (banner, settings, sign-in, unsubscribe link).
  - Age: `age_confirmed_at`.
- `PRIVACY_VERSION` matches SQL `current_privacy_version()` (core test and SQL test 650).
- **Mobile:** the app sends no analytics from the device; the server-side gate covers
  its events. A consent screen for mobile error reports comes with the mobile screens
  (L1).
- **Tests:**
  - web banner tests;
  - SQL test 650;
  - the a11y audit, which now also covers the banner and `/cookies` and fixed a keyboard
    issue with the scrollable table on phones;
  - the third-party request audit: still none.

## S25: Data minimization

- **Inventory:** `docs/data-inventory.md` (the source of truth is
  `packages/core/src/privacy/data-inventory.ts`) covers every table, why it's needed,
  whether it's personal, and its retention, plus what each outside service receives. A
  test fails if a migration adds a table without an entry.
- **Removed or reduced:**
  - the IP address and GeoIP lookup in PostHog events;
  - birth dates (only the age confirmation is kept, S12);
  - IPs in dispute evidence;
  - reminder text in `notification_log`, now deleted after 90 days;
  - plan alerts, expired OAuth states, and old busy times, now on a daily
    `cleanup_retention` job.
- **Sentry:** it already scrubs personal data (S3/S14); the launch checklist adds the
  project-level IP and retention settings.
- **Tests:** the core inventory test, a PostHog event test, and SQL test 660.
