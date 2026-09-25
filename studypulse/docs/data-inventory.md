# Data inventory

This is what StudyPulse collects and why (launch safety S25). The per-table source of
truth is `packages/core/src/privacy/data-inventory.ts`; a test fails if a table is added
without an entry. Use this for the App Store privacy label, the Play data safety form
(launch checklist §5), and the privacy policy.

## What students give us

| Data                                                                           | Where                                                       | Why                                                   | Required               |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------------- | ---------------------- |
| Email and password (hashed by Supabase Auth), or Apple/Google sign-in          | `auth.users`                                                | Account                                               | Yes                    |
| Birth month and year                                                           | Checked at sign-up, **not stored**: only `age_confirmed_at` | 13+ age gate (COPPA)                                  | Yes                    |
| Display name, school                                                           | `profiles`                                                  | Greeting; school is optional and unused for discounts | No                     |
| Time zone, study times                                                         | `profiles`                                                  | Local dates, reminders, plans                         | Yes (defaulted)        |
| Courses, assignments, grades, class times, links, cards, focus sessions, notes | course tables                                               | The product itself                                    | As used                |
| Syllabus files and text                                                        | private storage bucket, `syllabus_uploads`                  | Parsing                                               | As used                |
| Push tokens, device id, app version                                            | `notification_tokens`                                       | Reminders to the right device                         | Only with reminders on |
| Google Calendar / Canvas tokens                                                | Supabase Vault (encrypted)                                  | Optional integrations                                 | No                     |
| Consent records                                                                | `terms_acceptances`, `consent_log`                          | Proof of consent                                      | Yes                    |

## Collected automatically

| Data                                                                                                            | Where                         | Retention                                                 |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------- |
| Sign-in sessions (time, browser)                                                                                | Supabase Auth                 | Session lifetime                                          |
| Request counts by account or **hashed** IP                                                                      | `private.rate_limit_counters` | 1 day                                                     |
| Failed sign-in counts                                                                                           | `private.password_attempts`   | 15-minute windows                                         |
| Product events: no names, titles, or grades; **no IP, no GeoIP**; only with consent                             | `analytics_events` → PostHog  | Deleted from the outbox once sent                         |
| Error reports: headers, cookies, and credentials scrubbed; browser reports only with consent; no session replay | Sentry                        | Sentry's retention (set to 30 days in the Sentry project) |
| Sent reminders (text, status)                                                                                   | `notification_log`            | **90 days** (daily job)                                   |

## Minimizations made for launch

- **Age:** birth month is checked and discarded; only `age_confirmed_at` is kept (S12).
- **PostHog:** events carry `$ip: null` and `$geoip_disable: true`; they're sent from our
  servers, never from browsers or phones; and only with consent (S23).
- **Sentry:**
  - `sendDefaultPii: false`, and `scrubEvent` redacts headers, cookies, and bodies.
  - Replay is off.
  - Browser reporting starts only with consent and goes through our `/monitoring` tunnel.
- **IP addresses:** never stored in our database; rate limiting uses SHA-256 hashes.
- **Dispute evidence:** sign-in history is time and browser only, no IPs.
- **Retention jobs:**
  - notification log and plan alerts: 90 days;
  - OAuth state rows: 1 day after expiry;
  - calendar busy times: 30 days after they end;
  - dedupe keys: 30 days;
  - stale push tokens: 90 days;
  - rate-limit counters: 1 day.

## Outside services

See `PROCESSORS` in the same file. It matches the processors table in the privacy
policy: Supabase, Anthropic, Sentry, PostHog, Expo, RevenueCat, Stripe, Resend, and
Google (optional).

## Privacy label (App Store) and data safety (Play)

- **Linked to the user:**
  - contact info (email; name if given);
  - user content (course material, syllabi);
  - identifiers (user id);
  - usage data (product interaction, only with consent);
  - diagnostics (crash data, with consent in the EU/UK);
  - purchases (via the stores).
- **Not collected:** location, contacts, browsing history, health, financial info (cards
  stay with Stripe/Apple/Google), sensitive info.
- **Tracking (ATT):** none; no data is used for advertising or shared with data brokers.
