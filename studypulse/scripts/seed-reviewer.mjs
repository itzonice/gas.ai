// Creates or refreshes the App Store / Google Play review account (launch audit L1):
// a confirmed, onboarded student on the free plan with three courses mid-term, graded
// work, work due this week, and two weeks of focus sessions. AI consent is left off on
// purpose, so reviewers see the AI prompt before their first syllabus upload.
//
// Run by an operator with the production service-role key in the environment (never
// pasted anywhere else), before each store submission so the dates are current:
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//   REVIEWER_EMAIL=appreview@yourdomain.example [REVIEWER_PASSWORD=...] \
//     pnpm reviewer:seed
//
// Without REVIEWER_PASSWORD a new random password is set and printed once; put it in the
// review notes in App Store Connect and the Play Console, nowhere else. Re-running
// replaces the account's courses (and everything under them) with fresh demo data.
import { randomBytes } from "node:crypto";

import { reviewerDemo, REVIEWER_TIMEZONE } from "../packages/core/src/launch/reviewer-demo.ts";
import { TERMS_VERSION } from "../packages/core/src/legal/index.ts";
import { localDate } from "../packages/core/src/time/index.ts";

const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.REVIEWER_EMAIL?.trim().toLowerCase();
if (!url || !key || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and REVIEWER_EMAIL in the environment.",
  );
  process.exit(2);
}
const password = process.env.REVIEWER_PASSWORD || randomBytes(18).toString("base64url");
if (password.length < 10) {
  console.error("REVIEWER_PASSWORD must be at least 10 characters.");
  process.exit(2);
}

const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

async function call(method, path, body, extra = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { ...headers, ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) {
    const error = new Error(
      `${method} ${path.split("?")[0]} failed (${String(res.status)}): ${text}`,
    );
    error.status = res.status;
    throw error;
  }
  return text ? JSON.parse(text) : null;
}
const rest = (method, table, query, body) =>
  call(method, `/rest/v1/${table}${query ? `?${query}` : ""}`, body, {
    prefer: "return=representation",
  });

async function findUser() {
  for (let page = 1; page <= 50; page++) {
    const { users } = await call("GET", `/auth/v1/admin/users?page=${String(page)}&per_page=200`);
    const hit = users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (users.length < 200) return null;
  }
  return null;
}

// 1. The account: created confirmed, with the age and terms answers a real sign-up gives.
const metadata = { timezone: REVIEWER_TIMEZONE, display_name: "App Review" };
// Only the account this script made is ever touched: a typo in REVIEWER_EMAIL that
// matches a real student must not reset their password or delete their courses.
let user = await findUser();
if (user && user.app_metadata?.reviewer_demo !== true) {
  console.error(
    `${email} belongs to an account this script didn't create, so it was left alone. Use an address only for store review.`,
  );
  process.exit(1);
}
if (user) {
  await call("PUT", `/auth/v1/admin/users/${user.id}`, {
    password,
    email_confirm: true,
    user_metadata: metadata,
  });
} else {
  user = await call("POST", "/auth/v1/admin/users", {
    email,
    password,
    email_confirm: true,
    user_metadata: { ...metadata, birth_month: "2000-01", terms_version: TERMS_VERSION },
    // Marks the review account (only the service role can set app_metadata).
    app_metadata: { reviewer_demo: true },
  });
}
const userId = user.id;

// 2. Fresh demo data. Deleting the courses removes their assignments, sessions, and blocks.
const today = localDate(new Date(), REVIEWER_TIMEZONE);
const demo = reviewerDemo(today);
await rest("DELETE", "courses", `user_id=eq.${userId}`);
await rest("PATCH", "profiles", `id=eq.${userId}`, {
  timezone: REVIEWER_TIMEZONE,
  display_name: "App Review",
  onboarded_at: new Date().toISOString(),
});

const courses = await rest(
  "POST",
  "courses",
  "select=id,code",
  demo.courses.map(({ key: _key, ...c }) => ({ ...c, user_id: userId })),
);
const courseId = new Map(
  demo.courses.map((c) => [c.key, courses.find((row) => row.code === c.code)?.id]),
);

const categories = await rest(
  "POST",
  "grade_categories",
  "select=id,course_id,name",
  demo.categories.map((g) => ({
    course_id: courseId.get(g.course),
    name: g.name,
    weight: g.weight,
    position: g.position,
  })),
);
const categoryId = (course, name) =>
  categories.find((g) => g.course_id === courseId.get(course) && g.name === name)?.id ?? null;

const assignments = await rest(
  "POST",
  "assignments",
  "select=id,course_id,title",
  demo.assignments.map(({ course, category, ...a }) => ({
    ...a,
    course_id: courseId.get(course),
    category_id: categoryId(course, category),
    source: "syllabus",
  })),
);
const assignmentId = (course, title) =>
  assignments.find((a) => a.course_id === courseId.get(course) && a.title === title)?.id ?? null;

await rest(
  "POST",
  "study_sessions",
  "select=id",
  demo.sessions.map((s) => ({
    user_id: userId,
    course_id: courseId.get(s.course),
    assignment_id: assignmentId(s.course, s.title),
    started_at: s.started_at,
    ended_at: s.ended_at,
    source: "timer",
  })),
);

console.log(
  `Reviewer account ready: ${email} (${String(courses.length)} courses, ${String(assignments.length)} assignments, ${String(demo.sessions.length)} focus sessions).`,
);
if (!process.env.REVIEWER_PASSWORD) {
  console.log(`New password (shown once; put it in the store review notes): ${password}`);
}
console.log("The study plan fills in within a minute (the scheduler runs on new assignments).");
