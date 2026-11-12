# Information security program

Launch audit L9. This is StudyPulse's written security program: who is responsible, what
we protect, how we check it, and how long we keep data. The GDPR (Art. 32), California's
CCPA regulations, and the FTC's view of "reasonable security" all expect one in writing.
It's general information, not legal advice; have counsel review it with the privacy
policy.

Fill in the bracketed parts before launch.

## 1. Who is responsible

| Role                         | Person                           | Backup   |
| ---------------------------- | -------------------------------- | -------- |
| Security and privacy owner   | [owner name, email]              | [backup] |
| Incident lead (first call)   | Security owner                   | [backup] |
| Support inbox (user reports) | `SUPPORT_EMAIL` (set in the env) | —        |

The owner reviews this document **once a year** and after any incident, and signs off in
the change log at the bottom.

## 2. What we protect

The full list is [data-inventory.md](data-inventory.md) (a test fails if a table is added
without an entry). The most sensitive items:

- Grades, course material, and uploaded syllabi (student education information).
- Account email and sign-in sessions.
- Canvas and Google OAuth tokens (stored encrypted in Supabase Vault).
- Payment status (card data never reaches us; Stripe, Apple, and Google hold it).

## 3. Safeguards in place

Each has a test or CI check; details are in [security-audit.md](security-audit.md).

- **Access to data:** row-level security on every table, a cross-user attack suite in CI
  (420 attempts, 0 successes), and server-side entitlement checks.
- **Secrets:** gitleaks in a pre-commit hook and CI over the full history; `.env*` files
  ignored; a client-bundle secret scan in CI; secrets only in environment settings.
- **Inputs:** zod validation on every edge function, webhook, and AI response; a CI check
  that every function authenticates, validates, and is rate limited.
- **Abuse:** per-IP and per-user rate limits, sign-in lockout, a daily AI spend cap.
- **Logs:** secrets, emails, and syllabus text are redacted before logs and Sentry.
- **Minimization:** no IP addresses stored; birth month checked and discarded; analytics
  and browser error reports only with consent; nothing sent to the AI provider without
  consent (L2-AI).
- **Vendors:** every processor is listed in the privacy policy and `PROCESSORS`; each has
  a data processing agreement ([ ] Supabase, [ ] Vercel, [ ] Anthropic, [ ] Stripe,
  [ ] Resend, [ ] Sentry, [ ] PostHog, [ ] RevenueCat, [ ] Expo).

## 4. Regular checks

| When                    | Check                                                                        |
| ----------------------- | ---------------------------------------------------------------------------- |
| Every change            | CI: lint, types, tests, SQL tests, cross-user suite, secret and license scan |
| Weekly                  | Dependabot / `pnpm audit --prod` findings triaged (L8)                       |
| Monthly                 | Review Supabase and Vercel access lists; remove anyone who doesn't need it   |
| Every 3 months          | Restore a backup to a scratch project and check it (launch checklist §2)     |
| Once a year             | Risk review: what changed, new data, new vendors; update this document       |
| Before each big feature | Update the data inventory and privacy policy first                           |

Accounts with access to production (Supabase, Vercel, Stripe, GitHub, Apple, Google)
must use two-factor authentication.

## 5. Retention schedule

| Data                                          | Kept for                                         | How it's removed                       |
| --------------------------------------------- | ------------------------------------------------ | -------------------------------------- |
| Account and everything in it                  | Until the student deletes it                     | Delete account (immediate cascade)     |
| Backups                                       | [30] days                                        | Supabase point-in-time recovery window |
| Sent reminder log, study plan alerts          | 90 days                                          | Daily job `cleanup_retention`          |
| Calendar busy times                           | 30 days after they end                           | Daily job                              |
| OAuth state rows                              | 1 day after expiry                               | Daily job                              |
| Rate-limit counters (hashed IPs)              | 1 day                                            | Scheduled job                          |
| Stale push tokens                             | 90 days                                          | Scheduled job                          |
| Analytics outbox                              | Until sent to PostHog                            | Deleted once sent                      |
| Sentry error reports                          | 30 days                                          | Sentry project setting                 |
| Consent and terms records                     | Life of the account                              | Deleted with the account               |
| Dormant accounts (no sign-in for [24] months) | [Decide: email a warning, then delete at 24 + 1] | [Not built yet; decide before launch]  |

Indefinite retention of anything not tied to an active account is not allowed.

## 6. Incidents

See [incident-response.md](incident-response.md).

## Change log

| Date       | Change        | Approved by |
| ---------- | ------------- | ----------- |
| 2026-09-26 | First version | [owner]     |
