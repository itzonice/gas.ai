# Production launch checklist

Work top to bottom; later steps depend on earlier ones. Each item names the exact
setting, command, or variable. Nothing here is automated yet; tick items as you go.
Related: [security audit](security-audit.md), [analytics](analytics.md),
[load tests](../load/README.md).

## 0. Weeks before launch (long lead times)

- [ ] **Apple Family Controls (Distribution) entitlement** requested:
      https://developer.apple.com/contact/request/family-controls-distribution
      (approval takes weeks; until granted, production builds keep it off).
- [ ] Apple Developer Program and Google Play Console accounts active; D-U-N-S number for
      the Apple organization account if publishing as a company.
- [ ] Bundle ID `app.studypulse.mobile` (iOS) and package `app.studypulse.mobile`
      (Android) registered, or changed in `apps/mobile/app.json` before the first build
      (they can't change after release).
- [ ] App Store / Play subscription products created with the ids in
      `packages/core/src/billing/revenuecat.ts`, each attached to the `pro` entitlement
      and the `default` offering in RevenueCat; App Store paid-apps agreement signed.
- [ ] Sending domain verified in Resend (SPF, DKIM, DMARC on e.g. `mail.studypulse.app`).
- [ ] Privacy policy and terms published at stable URLs (both stores require them).
- [ ] **Name search (S27).** Search "StudyPulse" (and any other name you might ship
      under) in the USPTO trademark database (https://tmsearch.uspto.gov, classes 9, 41,
      and 42), the App Store, and Google Play. A live mark or a similar app name in the
      same space means pick another name now; renaming after launch loses reviews and
      links. Repeat in the EUIPO and UKIPO databases if you launch there.
- [ ] **Replace template artwork (S27).** The mobile icons and splash image and the web
      favicon are still the Expo and Next.js template defaults (see
      [licenses](licenses.md#images-and-icons)). Stores reject template icons.
- [ ] Decide the minimum age. Students under 13 bring COPPA obligations in the US; the
      simplest launch position is 13+ (state it in the terms and the age rating).

## 0.5 Hard spend limits (launch safety S7)

Set these before any real traffic, so a bug, a loop, or abuse can't run up a surprise bill.
Numbers are starting points; raise them as usage grows.

- [ ] **Anthropic Console** → Settings → Limits: set a monthly **spend limit** on the
      production workspace (requests stop when it's reached) and email notifications at
      50% and 80%. Use a dedicated workspace and API key for production.
- [ ] **Supabase** → Organization → Billing: keep the **spend cap on** (the default on Pro),
      so usage past the plan's quota is throttled instead of billed. Turn it off only
      deliberately, with a usage alert set.
- [ ] **Vercel** → Settings → Billing → **Spend Management**: set a monthly amount with
      notifications, and "pause production deployment" when it's reached.
- [ ] **In the app**: each user's AI spend is capped per local day (`public.ai_daily_caps`:
      $1.00 Free, $5.00 Pro). Parses and card generations stop with `ai_budget_exceeded`
      until the user's next local day. Adjust with
      `update public.ai_daily_caps set cents = ... where plan_tier = ...` (no deploy).
      The cost alerts (`AI_COST_ALERT_USER_CENTS`, `AI_COST_ALERT_TOTAL_CENTS`) warn before
      the caps are hit.
- [ ] Stripe, Resend, Sentry, PostHog, Expo: check each plan's overage behavior; prefer
      plans that stop or throttle over plans that bill overages without a cap.

## 1. Supabase production project

- [ ] Create the project in the region nearest most users; **Pro plan or higher** (needed
      for daily backups and point-in-time recovery).
- [ ] Link and apply migrations (never `db reset` in production):
      `supabase link --project-ref <ref>` then `supabase db push`.
      Confirm with `supabase migration list` that local and remote match.
- [ ] Run the SQL test suite against a staging copy, not production:
      `supabase test db --db-url <staging-url>`.
- [ ] Extensions enabled by the migrations are present: `pg_cron`, `pg_net`, `pgcrypto`,
      `supabase_vault` (Database → Extensions).
- [ ] Vault secrets for scheduled jobs (SQL editor):
      `select vault.create_secret('https://<ref>.supabase.co', 'project_url');`
      `select vault.create_secret('<same value as CRON_SECRET>', 'cron_secret');`
- [ ] All 13 cron jobs present and active (`select jobname, schedule, active from cron.job;`):
      send-reminders, send-email-digests, nightly-replan, process-replan-requests,
      canvas-sync, google-calendar-sync, create-card-tasks, flush-analytics,
      ai-cost-monitor, refresh-plan-tiers, cleanup-notification-dedupe, cleanup-push-tokens,
      cleanup-analytics-events.
- [ ] Storage: bucket `syllabi` exists, private, 20 MB limit (created by migrations).
- [ ] **Auth** (Authentication → Settings), per the security audit:
  - [ ] Site URL = the production web origin; redirect allowlist = production web origin,
        `<origin>/update-password` (password reset), and the app's deep-link scheme only
        (remove localhost).
  - [ ] Email confirmations on (also hides whether an email is registered at sign-up);
        secure password change on; minimum password length 10; leaked-password protection on.
  - [ ] Rate limits (launch safety S6): sign-in/sign-up per IP 30 per 5 minutes; one
        confirmation or reset email per address per 60 s (`max_frequency`).
  - [ ] Per-account password lockout: enable the Auth hook "Password verification attempt"
        → `public.hook_password_verification_attempt` (10 wrong passwords in 15 minutes lock
        sign-in for 15 minutes, worded like a wrong password). Hosted Supabase offers this
        hook on the Team plan; on other plans, CAPTCHA below is the per-email protection.
  - [ ] CAPTCHA (Turnstile or hCaptcha) on sign-in, sign-up, and password reset. Known gap
        until then: the auth API itself answers `422 User already registered` to a direct
        sign-up call for a registered email (the apps never show it). Closing it fully means
        a server-side sign-up endpoint with signups disabled on the public API.
  - [ ] Custom SMTP (Resend) so auth emails come from your domain; review rate limits.
  - [ ] JWT expiry 3600 s; refresh token rotation on.
  - [ ] Ended sessions can't use their tokens (S5): the migration sets
        `pgrst.db_pre_request = request_guard.require_live_session` on the `authenticator`
        role. Confirm after deploy: sign in, sign out everywhere, and the old access token
        gets 401 from `/rest/v1/courses`.
- [ ] Database: SSL enforcement on; network restrictions if you have fixed admin IPs.
- [ ] **Edge functions deployed**: `supabase functions deploy` (deploys all 22; config in
      `supabase/config.toml`). Confirm `verify_jwt` matches config for each
      (webhooks, cron, calendar-feed, email-unsubscribe, canvas-oauth, google-oauth,
      google-calendar-sync, and features are `false`).
- [ ] `pnpm deploy:check --strict` passes (lists every optional integration as on or off;
      `GET /functions/v1/features` shows what the apps will see).
- [ ] **Function secrets** (`supabase secrets set --env-file prod.env`; never commit it):

      | Group | Variables |
      |---|---|
      | Core | `APP_ENV=production`, `APP_URL`, `CRON_SECRET` (random, 32+ chars) |
      | AI | `ANTHROPIC_API_KEY`, optional `PARSER_MODEL` and `CARDS_MODEL` |
      | Errors / analytics | `SENTRY_DSN`, `POSTHOG_API_KEY`, `POSTHOG_HOST` |
      | Push | `EXPO_ACCESS_TOKEN` (if push security on), `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` |
      | Email | `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_UNSUBSCRIBE_SECRET` (random, 32+) |
      | Stripe | `STRIPE_SECRET_KEY` (live), `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `STRIPE_WEBHOOK_SECRET`, optional `STRIPE_STUDENT_COUPON_ID`, `STUDENT_EMAIL_DOMAINS` |
      | RevenueCat | `REVENUECAT_WEBHOOK_AUTH` (random, 24+) |
      | Google Calendar | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
      | Alerts | `AI_COST_ALERT_USER_CENTS`, `AI_COST_ALERT_TOTAL_CENTS`, `ALERT_WEBHOOK_URL` |

      Generate VAPID keys once with `pnpm --filter @studypulse/core vapid:keys`. Leave all
      `*_API_URL` overrides unset in production. Every value is validated at startup, so a
      typo fails loudly in the function logs.

- [ ] Webhooks registered:
  - [ ] Stripe → `https://<ref>.supabase.co/functions/v1/stripe-webhook`, events
        `customer.subscription.*`, `charge.refunded`, `invoice.paid`, and
        `invoice.upcoming` (confirmation and yearly renewal reminder emails, S16),
        `charge.dispute.created` and `radar.early_fraud_warning.created` (S20); its
        signing secret is `STRIPE_WEBHOOK_SECRET`.
  - [ ] Stripe Radar on (it is by default) with the default rules; `ALERT_WEBHOOK_URL`
        set so dispute and fraud alerts reach someone (they also go to Sentry).
  - [ ] Stripe → Settings → Billing → Subscriptions: "Upcoming renewal events" at least
        7 days before renewal (when `invoice.upcoming` fires). Also turn on Stripe's own
        receipts and "Send emails about upcoming renewals" as a second reminder.
  - [ ] RevenueCat → `.../functions/v1/revenuecat-webhook` with Authorization header =
        `REVENUECAT_WEBHOOK_AUTH`; send a test event and check `billing_events`.
- [ ] Stripe → Settings → Business → Public details (S19): statement descriptor
      `STUDYPULSE PRO` (shortened `STUDYPULSE`), support email = `SUPPORT_EMAIL`, support
      URL = `<web origin>/refunds`, business website. Settings → Emails: turn on successful
      payment and refund receipts (they show these details). The same address goes in
      `SUPPORT_EMAIL`, `NEXT_PUBLIC_SUPPORT_EMAIL`, and `EXPO_PUBLIC_SUPPORT_EMAIL`, and
      someone must watch that inbox.
- [ ] App Store Connect → App Information → License Agreement: custom EULA with the text
      of `/eula` (S22), or Apple's standard EULA with `/eula` linked in the description.
      Google Play: link `/eula` and `/terms` in the store listing.
- [ ] Sentry project settings (S25): data retention 30 days (or the shortest your plan
      allows), "Prevent storing of IP addresses" on, default scrubbers on.
- [ ] PostHog project settings (S25): "Discard client IP data" on (events already send
      no IP), person profiles only for identified users.
- [ ] Refund window (S18): replace `[N]` on `/refunds` with the window you'll honor.
- [ ] Stripe Tax (S26): add tax registrations where required, then set
      `STRIPE_AUTOMATIC_TAX=true` so Checkout shows the total including tax before payment.
- [ ] Stripe customer portal (S26): cancellation on, **no retention coupons or forced
      offers** when canceling; the cancel reason survey (if any) must be skippable.
- [ ] Stripe: customer portal configured (cancel, update card, invoices); student coupon
      created with **no** public promotion code; Stripe Tax if selling where required.
- [ ] Canvas schools you'll support registered with their developer keys:
      `select public.lms_register_institution('<name>', 'https://<canvas host>', '<client id>', '<client secret>');`
- [ ] Google Calendar sync: an OAuth web client in Google Cloud Console with redirect URI
      `https://<ref>.supabase.co/functions/v1/google-oauth/callback`, the Calendar API
      enabled, and the consent screen listing the two scopes (`calendar.app.created`,
      `calendar.freebusy`). Both are sensitive scopes: submit for Google's verification
      early (it takes weeks; until then, only listed test users can connect).
- [ ] Smoke test in production with a real account: sign up, upload a syllabus, commit,
      start and stop a session, receive a reminder, subscribe with a Stripe test clock or a
      real card then refund it, export data, delete the account.

## 2. Backups and recovery

- [ ] Daily backups confirmed (Database → Backups); **point-in-time recovery** enabled.
- [ ] Restore drill: restore last night's backup into a scratch project and run
      `supabase test db --db-url <scratch>`; write down how long it took (your real RTO).
- [ ] Storage files (uploaded syllabi) are not in database backups: schedule a copy of
      the `syllabi` bucket to separate object storage, or accept they're re-uploadable.
- [ ] Vault secrets are in the database (included in backups) but encrypted with a
      project key; restoring into a _different_ project needs the secrets re-created.
- [ ] Keep an offline copy of every production secret in a password manager with two
      owners.

## 3. Web (Vercel)

- [ ] Import the repo; **Root Directory** `studypulse/apps/web`; framework Next.js;
      install `pnpm install` (Vercel detects the workspace); Node 22.
- [ ] Environment variables (Production and Preview separately):
      `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
      `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_SUPPORT_EMAIL`,
      `NEXT_PUBLIC_COMPANY_LEGAL_NAME`, `NEXT_PUBLIC_COMPANY_ADDRESS` (S28: shown in the
      footer and at checkout; `pnpm deploy:check --strict` fails without them),
      `SUPABASE_SERVICE_ROLE_KEY`
      (server only), and `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT_WEB` for source maps.
- [ ] Preview deployments point at a staging Supabase project, never production.
- [ ] Custom domain with HTTPS; confirm the security headers on the live site
      (`curl -I https://<domain>`: CSP, HSTS, X-Frame-Options).
- [ ] `APP_URL` (functions) and Supabase Auth Site URL match the final domain.

## 4. Mobile (EAS)

- [ ] `eas init` in `apps/mobile` (links the Expo project); `eas.json` has development,
      preview, and production profiles.
- [ ] EAS environment variables for production: `EXPO_PUBLIC_SUPABASE_URL`,
      `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_SENTRY_DSN`,
      `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`,
      `EXPO_PUBLIC_WEB_URL` (for the Terms and Privacy links), `EXPO_PUBLIC_SUPPORT_EMAIL`,
      `EXPO_PUBLIC_COMPANY_LEGAL_NAME`, `EXPO_PUBLIC_COMPANY_ADDRESS` (S28), and `SENTRY_AUTH_TOKEN`
      (source maps). Only public values go in `EXPO_PUBLIC_*`.
- [ ] Push credentials: APNs key uploaded to Expo (`eas credentials`), FCM v1 service
      account for Android.
- [ ] Family Controls: leave `EXPO_FAMILY_CONTROLS` unset for production until Apple
      approves the distribution entitlement; then set it and rebuild.
- [ ] Build: `eas build --platform all --profile production`.
- [ ] Test the production build on real devices through TestFlight and a Play internal
      track, including purchase with a sandbox account and restore purchases.
- [ ] Submit: `eas submit --platform ios --profile production` and
      `eas submit --platform android --profile production`.
- [ ] Store listing: screenshots per device size, description, keywords, support URL,
      age rating questionnaire (13+), review notes with a demo account (reviewers need to
      see a parsed syllabus without uploading their own).
- [ ] Legal URLs in both stores (App Store Connect → App Information; Play Console → App
      content → Privacy policy):
  - Privacy Policy: `https://app.studypulse.app/privacy`
  - Terms of Use (App Store "License Agreement" → custom EULA, and the subscription
    description): `https://app.studypulse.app/terms`
- [ ] **Legal text reviewed by counsel** (`apps/web/app/(legal)/`): fill in the bracketed
      company name, address, contacts, jurisdiction, and backup retention, then set
      `LEGAL_DRAFT = false` in `apps/web/components/legal/LegalPage.tsx` to remove the draft
      banner. This is a technical checklist, not legal advice.
- [ ] Terms and Privacy links appear on the web sign-up form, the upgrade page (paywall),
      web and mobile Settings, and the mobile sign-in and sign-up screens (guideline 3.1.2).
- [ ] The apps are native screens (Expo), not a web view of the site; a CI test fails if
      `react-native-webview` is added (guideline 4.2).
- [ ] Account deletion is in the app (required by both stores): Settings (gear on any tab)
      → Delete account → confirm. It calls `delete-account`, which also cancels web
      billing. App Store and Play subscriptions can only be cancelled by the user in the
      store; the confirmation says so before deleting.
- [ ] Sign in with Apple: not required today, since sign-in is email and password only
      (Google is used only to connect a calendar, which isn't sign-in). A CI test fails if a
      third-party sign-in provider is enabled in `supabase/config.toml` without Apple
      (guideline 4.8). If Apple sign-in is added, `delete-account` must also revoke the
      user's Apple token (Apple's REST `auth/revoke`, needs the Services ID key).

## 5. App Store privacy labels (and Play data safety)

What StudyPulse collects, from the schema and the services it sends data to. None of it
is used for tracking across other companies' apps (no ad SDKs), so **"Data Used to Track
You": none**. Everything below is **linked to the user's identity** (tied to their account).

| App Store data type                        | What                                                                        | Purpose (App Store terms)    |
| ------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------- |
| Contact Info → Email Address               | Sign-in email; digest emails via Resend                                     | App Functionality            |
| Contact Info → Name                        | Optional display name on the profile                                        | App Functionality            |
| User Content → Other User Content          | Uploaded syllabi, courses, assignments, grades, notes                       | App Functionality            |
| Identifiers → User ID                      | Account id (Supabase), also sent to PostHog, Sentry, RevenueCat             | App Functionality, Analytics |
| Identifiers → Device ID                    | Push tokens (Expo/APNs)                                                     | App Functionality            |
| Purchases → Purchase History               | Subscription status (Stripe, RevenueCat)                                    | App Functionality            |
| Usage Data → Product Interaction           | Server-side events (signed up, parsed, committed, session logged, upgraded) | Analytics                    |
| Diagnostics → Crash Data, Performance Data | Sentry (scrubbed of tokens and sensitive fields)                            | App Functionality            |
| Other Data                                 | Study session times and durations; timezone                                 | App Functionality            |

Not collected: location, contacts, health, financial info (card details stay with
Stripe/Apple/Google), browsing history, photos (beyond a syllabus photo the user picks,
which is User Content), audio, sensitive info. If organizations (schools) are enabled,
opted-in students' weekly focus totals are shared with that organization in aggregate
only; mention it in the privacy policy.

- [ ] Fill in App Store Connect → App Privacy with the table above.
- [ ] Fill in Play Console → Data safety with the same data, marked "encrypted in transit"
      and "users can request deletion" (in-app account deletion).
- [ ] Privacy manifest (`PrivacyInfo.xcprivacy`) generated by the Expo build includes
      required-reason API declarations for the native SDKs in use (Sentry, RevenueCat);
      check the build warnings in EAS.

## 6. Monitoring and on-call

- [ ] Sentry projects for web, mobile, and edge functions; alert rules for new issues and
      for tag `alert:ai_cost`.
- [ ] `ALERT_WEBHOOK_URL` pointed at a team channel; send a test alert.
- [ ] Uptime check on the web origin and on an unauthenticated function
      (e.g. `calendar-feed` with a bogus token returns 404 quickly).
- [ ] Supabase: usage alerts for database size, egress, and function invocations.
- [ ] PostHog: activation funnel and dashboard from `docs/analytics.md`, filtered to
      `environment = production`.
- [ ] Stripe and RevenueCat: failed-webhook email alerts on.
- [ ] Weekly check of `cron.job_run_details` for failed runs:
      `select jobname, status, count(*) from cron.job_run_details jrd join cron.job j using (jobid) where start_time > now() - interval '7 days' group by 1, 2;`

## 7. Launch day

- [ ] Rotate any secret ever used outside production (staging, laptops, CI logs).
- [ ] Turn on GitHub secret scanning, Dependabot alerts, and branch protection on `main`
      (require the CI checks).
- [ ] Final smoke test (section 1) on production after the last deploy.
- [ ] Watch Sentry, function logs, and `ai-cost-monitor` for the first 48 hours.
