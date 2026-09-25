// Cron load test: runs each scheduled job once against a database seeded with
// load/seed-load.sql and checks it finishes inside its budget (the functions stop
// themselves at ~100 seconds and pick up the rest next run).
//   psql "$DB_URL" -v users=5000 -f load/seed-load.sql
//   k6 run -e CRON_SECRET=... load/k6/cron.js
import http from "k6/http";
import { check } from "k6";
import { Trend } from "k6/metrics";

import { fnUrl, requireEnv } from "./lib.js";

requireEnv("CRON_SECRET");
const JOBS = (
  __ENV.JOBS || "send-reminders,send-email-digests,nightly-replan,flush-analytics,ai-cost-monitor"
).split(",");
const runTime = new Trend("cron_run_ms", true);

export const options = {
  scenarios: {
    jobs: { executor: "shared-iterations", vus: 1, iterations: JOBS.length, maxDuration: "15m" },
  },
  thresholds: {
    "cron_run_ms{job:send-reminders}": ["max<60000"],
    "cron_run_ms{job:send-email-digests}": ["max<60000"],
    "cron_run_ms{job:nightly-replan}": ["max<90000"],
    "cron_run_ms{job:flush-analytics}": ["max<30000"],
    "cron_run_ms{job:ai-cost-monitor}": ["max<10000"],
    checks: ["rate==1"],
  },
};

export default function () {
  const job = JOBS[__ITER % JOBS.length];
  const res = http.post(fnUrl(job), "{}", {
    headers: { "x-cron-secret": __ENV.CRON_SECRET, "Content-Type": "application/json" },
    timeout: "180s",
    tags: { job },
  });
  runTime.add(res.timings.duration, { job });
  check(res, { [`${job} ok`]: (r) => r.status === 200 });
  console.log(`${job}: ${res.status} in ${Math.round(res.timings.duration)} ms: ${res.body}`);
}
