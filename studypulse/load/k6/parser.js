// Parser load test: many students uploading pasted-text syllabi at once.
// Each virtual user signs up, then uploads 3 syllabi (the free plan's daily limit) and
// waits for each to finish parsing. Measures the upload endpoint and the end-to-end
// time until the parse is ready to review.
//
// Point ANTHROPIC_BASE_URL (functions env) at load/mock-anthropic.ts first: this test
// must never run against the real model.
//   k6 run -e SUPABASE_ANON_KEY=... -e VUS=20 load/k6/parser.js
import http from "k6/http";
import { check, fail, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

import { ANON_KEY, SUPABASE_URL, fnUrl, requireEnv } from "./lib.js";

requireEnv("SUPABASE_ANON_KEY");
const VUS = Number(__ENV.VUS || 20);
const PARSE_TIMEOUT_S = Number(__ENV.PARSE_TIMEOUT_S || 60);

const parseE2e = new Trend("parse_end_to_end_ms", true);
const parseFailed = new Counter("parse_failed");
const parseTimedOut = new Counter("parse_timed_out");

export const options = {
  scenarios: {
    upload: { executor: "per-vu-iterations", vus: VUS, iterations: 3, maxDuration: "10m" },
  },
  thresholds: {
    "http_req_failed{step:upload}": ["rate<0.01"],
    "http_req_duration{step:upload}": ["p(95)<1500"],
    parse_end_to_end_ms: ["p(95)<30000"],
    parse_failed: ["count==0"],
    parse_timed_out: ["count==0"],
  },
};

const SYLLABUS = `BIO 201 Cell Biology, Spring 2027. Instructor: Dr. Okafor.
Grading: Exams 50%, Labs 25%, Quizzes 15% (lowest dropped), Participation 10%.
Lab 1 due Friday, January 22 at 11:59 PM. Quiz 1 on membranes: Wednesday, January 27.
Midterm Exam: March 4 in class. Final Exam: Tuesday, May 11, 8:00-10:00 AM.
`.repeat(3);

const jsonHeaders = (token) => ({
  "Content-Type": "application/json",
  apikey: ANON_KEY,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

// One account per VU per run, created on the VU's first iteration.
let token = null;
function signIn() {
  if (token) return token;
  const email = `load-parser-${__VU}-${Date.now()}@load.test`;
  const res = http.post(
    `${SUPABASE_URL}/auth/v1/signup`,
    JSON.stringify({ email, password: "load-test-password-1" }),
    { headers: jsonHeaders(), tags: { step: "signup" } },
  );
  if (!check(res, { "signed up": (r) => r.status === 200 && r.json("access_token") })) {
    fail(`signup failed: ${res.status} ${res.body}`);
  }
  token = res.json("access_token");
  return token;
}

export default function () {
  const t = signIn();
  const started = Date.now();
  const res = http.post(
    fnUrl("upload-syllabus"),
    JSON.stringify({ source: "text", text: SYLLABUS }),
    {
      headers: jsonHeaders(t),
      tags: { step: "upload" },
    },
  );
  if (!check(res, { "upload accepted": (r) => r.status === 200 || r.status === 202 })) return;
  const uploadId = res.json("upload_id");

  for (let waited = 0; waited < PARSE_TIMEOUT_S; waited++) {
    sleep(1);
    const poll = http.get(
      `${SUPABASE_URL}/rest/v1/syllabus_uploads?id=eq.${uploadId}&select=status`,
      {
        headers: jsonHeaders(t),
        tags: { step: "poll" },
      },
    );
    const status = poll.json("0.status");
    if (status === "parsed") {
      parseE2e.add(Date.now() - started);
      return;
    }
    if (status === "failed") {
      parseFailed.add(1);
      return;
    }
  }
  parseTimedOut.add(1);
}
