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
