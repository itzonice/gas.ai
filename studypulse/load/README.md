# Load tests and AI cost alerts

## Running

Load tests run against a **local or staging** stack, never production, and never against
the real Claude API: point the functions' `ANTHROPIC_BASE_URL` at the mock.

```sh
deno run --allow-net --allow-env load/mock-anthropic.ts          # mock Claude, ~3 s per parse
psql "$DB_URL" -v users=5000 -f load/seed-load.sql                # bulk data for the cron test

k6 run -e SUPABASE_ANON_KEY=... -e VUS=20 load/k6/parser.js       # uploads + end-to-end parse time
k6 run -e CRON_SECRET=... load/k6/cron.js                         # every scheduled job, timed

psql "$DB_URL" -f load/cleanup-load.sql                           # remove all @load.test users
```

Without a local k6: `docker run --rm --network host -v "$PWD/load/k6:/scripts" grafana/k6 run /scripts/parser.js`.
To target a function served somewhere other than `$SUPABASE_URL/functions/v1`, set
`FN_<NAME>` (e.g. `FN_UPLOAD_SYLLABUS=http://127.0.0.1:8140`).

## Results (local stack, 2026-09-25)

Single-process local functions and a local Postgres, so these are floors, not production
capacity. Hosted Edge Functions run many instances.

**Parser** (`parser.js`, mock model latency 3 s ± 30%; each student uploads 3 syllabi):

| Students at once | Uploads | Upload p95 | Parse ready p95 | Failed | Timed out |
| ---------------- | ------- | ---------- | --------------- | ------ | --------- |
| 20               | 60      | 423 ms     | 4.4 s           | 0      | 0         |
| 100              | 300     | 1.96 s     | 6.0 s           | 0      | 0         |

At 100 concurrent students the one local function process saturates (upload p95 over the
1.5 s target) but nothing fails and parses still finish about 3 s after the model answers.
10% of signups got 429 from Supabase Auth's per-IP signup limit (all k6 traffic comes from
one IP); that's the limit working.

**Cron jobs** (`cron.js`, 3,000 seeded students, 9,000 courses, 36,000 assignments):

| Job                | Result                                    | Time    | Budget |
| ------------------ | ----------------------------------------- | ------- | ------ |
| send-reminders     | 2,250 users, 7,250 pushes                 | 18.5 s  | 60 s   |
| nightly-replan     | 375 users replanned (those at local 3 AM) | 20.7 s  | 90 s   |
| flush-analytics    | 10,000 events                             | 0.6 s   | 30 s   |
| send-email-digests | none due this window                      | < 0.1 s | 60 s   |
| ai-cost-monitor    | 0 alerts                                  | < 0.1 s | 10 s   |

**Found and fixed:** `send-reminders` failed outright (500, "URI too long") once a page of
500 users was due at once: the device lookup put every user id in one URL filter. Every
large id filter (reminders, push receipts, manual replans) is now chunked to 100 ids.
Logging also now shows the real message for Supabase errors (they were "[object Object]").

**Capacity:** send-reminders handles about 120 users/s here, so the 100-second run budget
covers about 12,000 users with something due in the same 15-minute window; beyond that a
run stops cleanly and the rest go out on the next run (15 minutes later). nightly-replan
handles about 18 users/s; with users spread across time zones the hourly run only sees
those at local 3 AM, so a single time zone would need about 65,000 users to exceed one
run. Revisit both (parallel pages or more frequent runs) before either number is reached.

## AI cost alerts

Each AI call's tokens are recorded per upload; `ai_cost_by_user()` prices them from the
`ai_model_prices` table (update rows there when prices change; unknown models are priced
at the highest known rate). The `ai-cost-monitor` function runs hourly and alerts, once per
day each, when over the last 24 hours:

- one user's AI cost passes `AI_COST_ALERT_USER_CENTS` (default 100 = $1.00). A free user
  can parse 3 syllabi a day and a Pro user 25; at roughly $0.02–0.10 per parse, $1 in a day
  means something unusual (huge documents, repeated retries, or abuse).
- total AI cost passes `AI_COST_ALERT_TOTAL_CENTS` (default 5000 = $50.00).

Alerts go to Sentry (warning, tag `alert:ai_cost`) and to `ALERT_WEBHOOK_URL` if set
(Slack-compatible). In Sentry, add an alert rule on `alert:ai_cost` to page or email.
