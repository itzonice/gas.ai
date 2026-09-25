// End-to-end cross-user access suite. Runs against a live local stack (Auth, PostgREST,
// Storage, and edge functions), as real signed-in users over HTTP.
//
//   pnpm test:cross-user            (needs `supabase start`; see the README in this folder)
//
// Setup: users A and B (and C, an organization admin) are created through the Auth API.
// B gets a full data set: courses, grade categories, assignments with scores, study
// sessions, a syllabus upload and its file in storage, study blocks, flashcards, a card
// generation, notification tokens and prefs, resources, class meetings, an ICS feed token,
// and an organization membership that shares focus hours. Every text field B owns carries
// a unique marker.
//
// Then, signed in as A (and as C for the organization checks), the suite tries to read,
// change, and delete B's data through every path it can enumerate:
// - every table and view the API exposes (read, filtered read, update, delete, insert as B)
// - every RPC, with B's ids in every id-like parameter
// - every edge function, with B's ids in the body and query
// - storage (download, signed URL, list, upload, move, delete, public URL, guessed paths)
// - the ICS feed (guessed and derived tokens), and the data and card exports
// - linking A's session, resources, cards, and assignments to B's course or assignment
// - an organization admin reading a member's assignments, grades, or sessions
//
// A response fails the suite if it contains any of B's markers, B's email, or any of B's
// ids that the request didn't itself supply; an RPC also fails if its successful answer
// changes when B's ids are swapped for random ones (B's data influenced the result).
// Finally every row of B's, read with the service role before and after, must be
// unchanged, and nothing new may have been attributed to B. The report lists every path.
import { assertEquals } from "@std/assert";

const env = (k: string, fallback?: string) => {
  const v = Deno.env.get(k) ?? fallback;
  if (!v) throw new Error(`${k} is required`);
  return v;
};
const API = env("SUPABASE_URL", "http://127.0.0.1:54321").replace(/\/+$/, "");
const ANON = env("SUPABASE_ANON_KEY");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
const FUNCTIONS = env("FUNCTIONS_URL", `${API}/functions/v1`).replace(/\/+$/, "");
const REPORT = Deno.env.get("CROSS_USER_REPORT") ?? "cross-user-report.md";
const FUNCTIONS_DIR = new URL("../../functions/", import.meta.url);

const RUN = crypto.randomUUID().slice(0, 8);
const MARK = `XB${RUN}X`; // in every text field B owns
const NAME_MARK = `XBNAME${RUN}X`; // B's display name (org admins may see names)
const PASSWORD = `pw-${crypto.randomUUID()}`;

type Json = unknown;
interface Res {
  status: number;
  text: string;
  json: Json;
}

async function http(
  url: string,
  init: {
    method?: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
    raw?: BodyInit;
  },
): Promise<Res> {
  const headers: Record<string, string> = { apikey: ANON, ...(init.headers ?? {}) };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let body: BodyInit | undefined = init.raw;
  if (init.body !== undefined) {
    headers["content-type"] ??= "application/json";
    body = JSON.stringify(init.body);
  }
  try {
    const r = await fetch(url, {
      method: init.method ?? "GET",
      headers,
      ...(body ? { body } : {}),
    });
    const text = await r.text();
    let json: Json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: r.status, text, json };
  } catch (e) {
    return { status: 0, text: String(e), json: null };
  }
}

const svc = { apikey: SERVICE, authorization: `Bearer ${SERVICE}` };
async function service(
  method: string,
  path: string,
  body?: unknown,
  extra: Record<string, string> = {},
) {
  const r = await http(`${API}${path}`, {
    method,
    headers: { ...svc, ...extra },
    ...(body === undefined ? {} : { body }),
  });
  if (r.status >= 400)
    throw new Error(`service ${method} ${path}: ${r.status} ${r.text.slice(0, 300)}`);
  return r.json;
}
function rest(
  token: string,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Res> {
  return http(`${API}/rest/v1${path}`, {
    method,
    token,
    headers,
    ...(body === undefined ? {} : { body }),
  });
}
function rpc(token: string, name: string, args: Record<string, unknown>): Promise<Res> {
  return rest(token, "POST", `/rpc/${name}`, args);
}

// ------------------------------------------------------------------------------ users

interface User {
  id: string;
  email: string;
  token: string;
}
async function createUser(label: string, displayName: string): Promise<User> {
  const email = `xuser-${label}-${RUN}@example.com`;
  const created = (await service("POST", "/auth/v1/admin/users", {
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      timezone: "America/Chicago",
      display_name: displayName,
      birth_month: "2001-06",
    },
  })) as { id: string };
  const session = await http(`${API}/auth/v1/token?grant_type=password`, {
    method: "POST",
    body: { email, password: PASSWORD },
  });
  const token = (session.json as { access_token?: string }).access_token;
  if (!token) throw new Error(`sign-in failed for ${label}: ${session.text}`);
  // Onboarded, so the app would let them in; also exercises their own-profile writes.
  await rest(token, "POST", "/rpc/complete_onboarding", {
    p_display_name: displayName,
    p_timezone: "America/Chicago",
    p_daily_study_minutes: 120,
    p_study_start_time: "16:00",
  });
  return { id: created.id, email, token };
}

// -------------------------------------------------------------------- B's data set

interface BData {
  courseId: string;
  categoryId: string;
  assignmentIds: string[];
  sessionId: string;
  uploadId: string;
  filePath: string;
  blockId: string;
  cardId: string;
  pushToken: string;
  pushTokenId: string;
  resourceId: string;
  meetingId: string;
  feedToken: string;
  orgId: string;
  joinCode: string;
}

/** Seeding must succeed, or the attacks below would prove nothing. */
function must(r: Res, what: string): Res {
  if (r.status === 0 || r.status >= 300)
    throw new Error(`seed ${what}: ${r.status} ${r.text.slice(0, 300)}`);
  return r;
}
function one<T>(r: Res, what: string): T {
  must(r, what);
  const v = Array.isArray(r.json) ? r.json[0] : r.json;
  return v as T;
}

async function seedB(b: User, c: User): Promise<BData> {
  const ret = { prefer: "return=representation" };
  const course = one<{ id: string }>(
    await rest(
      b.token,
      "POST",
      "/courses",
      { name: `Biology ${MARK}`, code: `BIO-${MARK}`, instructor: `Dr ${MARK}` },
      ret,
    ),
    "course",
  );
  const category = one<{ id: string }>(
    await rest(
      b.token,
      "POST",
      "/grade_categories",
      { course_id: course.id, name: `Exams ${MARK}`, weight: 100 },
      ret,
    ),
    "category",
  );
  const assignments = must(
    await rest(
      b.token,
      "POST",
      "/assignments",
      [
        {
          course_id: course.id,
          title: `Midterm ${MARK}`,
          kind: "exam",
          category_id: category.id,
          points_possible: 100,
          points_earned: 87,
          due_at: new Date(Date.now() + 5 * 864e5).toISOString(),
          description: `secret ${MARK}`,
        },
        {
          course_id: course.id,
          title: `Lab ${MARK}`,
          kind: "lab",
          category_id: category.id,
          points_possible: 10,
          points_earned: null,
          due_at: new Date(Date.now() + 2 * 864e5).toISOString(),
          description: `lab ${MARK}`,
        },
      ],
      ret,
    ),
    "assignments",
  ).json as { id: string }[];
  const assignmentIds = assignments.map((a) => a.id);

  const sessionId = crypto.randomUUID();
  must(
    await rpc(b.token, "start_study_session", {
      p_id: sessionId,
      p_course_id: course.id,
      p_assignment_id: assignmentIds[0],
      p_started_at: new Date(Date.now() - 50 * 60e3).toISOString(),
    }),
    "start_study_session",
  );
  must(await rpc(b.token, "stop_study_session", { p_id: sessionId }), "stop_study_session");
  must(
    await rest(b.token, "PATCH", `/study_sessions?id=eq.${sessionId}`, { notes: `notes ${MARK}` }),
    "PATCH",
  );

  const resource = one<{ id: string }>(
    await rest(
      b.token,
      "POST",
      "/assignment_resources",
      {
        assignment_id: assignmentIds[0],
        course_id: course.id,
        kind: "khan_academy",
        url: `https://www.khanacademy.org/${MARK}`,
        title: `Khan ${MARK}`,
      },
      ret,
    ),
    "resource",
  );
  const pushToken = `ExponentPushToken[${MARK}]`;
  const tokenRes = must(
    await rpc(b.token, "register_push_token", {
      p_provider: "expo",
      p_token: pushToken,
      p_platform: "ios",
      p_device_id: `dev-${MARK}`,
    }),
    "push token",
  );
  const pushTokenId = String(tokenRes.json);
  const feed = must(await rpc(b.token, "rotate_calendar_token", {}), "feed token");
  const feedToken = String(feed.json);

  // Service-role rows (written by server code in the app).
  const filePath = `${b.id}/syllabus-${MARK}.pdf`;
  must(
    await http(`${API}/storage/v1/object/syllabi/${filePath}`, {
      method: "POST",
      headers: { ...svc, "content-type": "application/pdf" },
      raw: new TextEncoder().encode(`%PDF-1.4 ${MARK} syllabus contents`),
    }),
    "storage file",
  );
  const upload = one<{ id: string }>(
    await http(`${API}/rest/v1/syllabus_uploads`, {
      method: "POST",
      headers: { ...svc, prefer: "return=representation" },
      body: {
        user_id: b.id,
        source: "pdf",
        file_path: filePath,
        original_filename: `${MARK}.pdf`,
        status: "parsed",
        extracted_text: `text ${MARK}`,
        parse_result: { course: { name: `Parsed ${MARK}` }, categories: [], assignments: [] },
      },
    }),
    "upload",
  );
  const block = one<{ id: string }>(
    await http(`${API}/rest/v1/study_blocks`, {
      method: "POST",
      headers: { ...svc, prefer: "return=representation" },
      body: {
        user_id: b.id,
        course_id: course.id,
        assignment_id: assignmentIds[0],
        starts_at: new Date(Date.now() + 864e5).toISOString(),
        ends_at: new Date(Date.now() + 864e5 + 36e5).toISOString(),
      },
    }),
    "block",
  );
  const card = one<{ id: string }>(
    await rest(
      b.token,
      "POST",
      "/flashcards",
      {
        course_id: course.id,
        assignment_id: assignmentIds[0],
        front: `Q ${MARK}?`,
        back: `A ${MARK}`,
      },
      ret,
    ),
    "flashcard",
  );
  must(
    await http(`${API}/rest/v1/card_generations`, {
      method: "POST",
      headers: svc,
      body: {
        user_id: b.id,
        course_id: course.id,
        notes_chars: 100,
        status: "done",
        card_count: 1,
      },
    }),
    "card generation",
  );
  const meeting = one<{ id: string }>(
    await rest(
      b.token,
      "POST",
      "/course_meetings",
      {
        course_id: course.id,
        weekday: 2,
        start_time: "10:00",
        end_time: "11:15",
        location: `Room ${MARK}`,
      },
      ret,
    ),
    "meeting",
  );
  must(
    await http(`${API}/rest/v1/notification_log`, {
      method: "POST",
      headers: svc,
      body: {
        user_id: b.id,
        kind: "due_24h",
        channel: "expo",
        status: "sent",
        dedupe_key: `due_24h:${MARK}`,
        title: `Due ${MARK}`,
        body: `Body ${MARK}`,
        assignment_id: assignmentIds[0],
      },
    }),
    "notification log",
  );

  // C runs an organization; B joins and shares focus hours.
  const org = one<{ organization_id: string; join_code: string }>(
    await rpc(c.token, "create_organization", { p_name: `Org ${RUN}` }),
    "org",
  );
  must(
    await rpc(b.token, "join_organization", { p_join_code: org.join_code }),
    "join_organization",
  );
  must(
    await rpc(b.token, "set_focus_sharing", {
      p_organization_id: org.organization_id,
      p_share: true,
    }),
    "set_focus_sharing",
  );

  return {
    courseId: course.id,
    categoryId: category.id,
    assignmentIds,
    sessionId,
    uploadId: upload.id,
    filePath,
    blockId: block.id,
    cardId: card.id,
    pushToken,
    pushTokenId,
    resourceId: resource.id,
    meetingId: meeting.id,
    feedToken,
    orgId: org.organization_id,
    joinCode: org.join_code,
  };
}

// ------------------------------------------------------------ enumeration + snapshot

interface Surface {
  tables: string[];
  rpcs: Map<
    string,
    {
      props: Record<string, { type?: string; format?: string; items?: unknown }>;
      required: string[];
    }
  >;
}
async function surface(): Promise<Surface> {
  const spec = (await service("GET", "/rest/v1/")) as {
    paths: Record<
      string,
      {
        post?: {
          parameters?: {
            in: string;
            schema?: {
              properties?: Record<string, { type?: string; format?: string }>;
              required?: string[];
            };
          }[];
        };
      }
    >;
  };
  const tables: string[] = [];
  const rpcs: Surface["rpcs"] = new Map();
  for (const [path, def] of Object.entries(spec.paths)) {
    if (path === "/") continue;
    if (path.startsWith("/rpc/")) {
      const schema = def.post?.parameters?.find((p) => p.in === "body")?.schema;
      rpcs.set(path.slice(5), {
        props: schema?.properties ?? {},
        required: schema?.required ?? [],
      });
    } else tables.push(path.slice(1));
  }
  return { tables: tables.sort(), rpcs };
}

/** Every row the service role sees in `table` (paged; max_rows is 100). */
async function allRows(table: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 100) {
    const r = await http(`${API}/rest/v1/${table}?select=*`, {
      headers: { ...svc, range: `${from}-${from + 99}` },
    });
    if (r.status >= 400 || !Array.isArray(r.json)) break;
    rows.push(...(r.json as Record<string, unknown>[]));
    if ((r.json as unknown[]).length < 100) break;
  }
  return rows;
}

/** B's rows in every table: rows that mention B's user id or any id of a row already B's. */
async function snapshotOfB(tables: string[], bId: string): Promise<Map<string, string[]>> {
  const data = new Map<string, Record<string, unknown>[]>();
  for (const t of tables) data.set(t, await allRows(t));
  const ids = new Set([bId]);
  const owned = new Map<string, Set<number>>();
  for (let changed = true; changed;) {
    changed = false;
    for (const [t, rows] of data) {
      rows.forEach((row, i) => {
        const set = owned.get(t) ?? new Set<number>();
        if (set.has(i)) return;
        const values = Object.values(row)
          .flatMap((v) => (Array.isArray(v) ? v : [v]))
          .map(String);
        if (values.some((v) => ids.has(v))) {
          set.add(i);
          owned.set(t, set);
          for (const k of ["id", "user_id"])
            if (typeof row[k] === "string") ids.add(row[k] as string);
          changed = true;
        }
      });
    }
  }
  const snap = new Map<string, string[]>();
  for (const [t, set] of owned) {
    snap.set(
      t,
      [...set]
        .map((i) => JSON.stringify(data.get(t)![i], Object.keys(data.get(t)![i]!).sort()))
        .sort(),
    );
  }
  return snap;
}

// ----------------------------------------------------------------------- the checks

interface Finding {
  area: string;
  path: string;
  attempt: string;
  status: number;
  ok: boolean;
  detail: string;
}
const findings: Finding[] = [];

let forbidden: string[] = [];
let bIds: string[] = [];

/** What in `text` is B's and wasn't supplied by the request itself. */
function leaks(text: string, supplied: string[] = [], allowName = false): string[] {
  const found: string[] = [];
  for (const f of forbidden) {
    if (allowName && f === NAME_MARK) continue;
    if (text.includes(f))
      found.push(f === MARK ? "B's marker text" : f === NAME_MARK ? "B's name" : f);
  }
  for (const id of bIds) if (!supplied.includes(id) && text.includes(id)) found.push(`B id ${id}`);
  return found;
}

function record(
  area: string,
  path: string,
  attempt: string,
  r: Res,
  supplied: string[] = [],
  extra: string[] = [],
  allowName = false,
) {
  const leaked = [...leaks(r.text, supplied, allowName), ...extra];
  findings.push({
    area,
    path,
    attempt,
    status: r.status,
    ok: leaked.length === 0,
    detail: leaked.join(", "),
  });
}

const normalize = (text: string, supplied: string[]) => {
  let t = text.replace(/\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}(?::?\d{2})?)?/g, "<time>");
  for (const s of supplied) t = t.split(s).join("<id>");
  return t.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>");
};

// ------------------------------------------------------------------------ the suite

Deno.test({
  name: "no user can read, change, or delete another user's data through any path",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    // Preflight: an unreachable functions server would make every function attempt
    // "leak nothing" and pass for the wrong reason.
    const probe = await http(`${FUNCTIONS}/features`, {});
    if (probe.status !== 200) {
      throw new Error(
        `edge functions are not reachable at ${FUNCTIONS} (status ${String(probe.status)})`,
      );
    }
    const a = await createUser("a", `Alice ${RUN}`);
    const b = await createUser("b", `Bob ${NAME_MARK}`);
    const c = await createUser("c", `Carol admin ${RUN}`);
    const bd = await seedB(b, c);

    // A's own course and assignment, for the linking attacks.
    const aCourse = one<{ id: string }>(
      await rest(
        a.token,
        "POST",
        "/courses",
        { name: "A course" },
        { prefer: "return=representation" },
      ),
      "A course",
    );
    const aAssignment = one<{ id: string }>(
      await rest(
        a.token,
        "POST",
        "/assignments",
        { course_id: aCourse.id, title: "A work" },
        { prefer: "return=representation" },
      ),
      "A assignment",
    );

    const surf = await surface();
    const before = await snapshotOfB(surf.tables, b.id);
    bIds = [
      ...new Set(
        [...before.values()]
          .flat()
          .flatMap((row) =>
            [...row.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)].map(
              (m) => m[0],
            ),
          ),
      ),
    ].filter(
      (id) =>
        id !== aCourse.id && id !== aAssignment.id && id !== a.id && id !== c.id && id !== bd.orgId,
    );
    forbidden = [MARK, NAME_MARK, b.email, bd.feedToken, bd.pushToken];
    // Sanity: the setup really gave B data in the important tables.
    for (const t of [
      "courses",
      "assignments",
      "grade_categories",
      "study_sessions",
      "syllabus_uploads",
      "study_blocks",
      "flashcards",
      "notification_tokens",
      "assignment_resources",
      "course_meetings",
      "card_generations",
    ]) {
      if (!before.get(t)?.length) throw new Error(`setup: B has no rows in ${t}`);
    }

    // ---- 1. Tables and views: read, filtered read, update, delete, insert as B.
    for (const t of surf.tables) {
      record(
        "table",
        t,
        "read all",
        await rest(a.token, "GET", `/${t}?select=*`, undefined, { range: "0-999" }),
      );
      record(
        "table",
        t,
        "read filtered by B's user id",
        await rest(a.token, "GET", `/${t}?select=*&user_id=eq.${b.id}`),
        [b.id],
      );
      const rows = (before.get(t) ?? []).map((r) => JSON.parse(r) as Record<string, unknown>);
      for (const row of rows.slice(0, 3)) {
        const pk = typeof row.id === "string" || typeof row.id === "number" ? "id" : "user_id";
        const key = String(row[pk]);
        record(
          "table",
          t,
          `read B's row by ${pk}`,
          await rest(a.token, "GET", `/${t}?select=*&${pk}=eq.${key}`),
          [key],
        );
        const col = Object.keys(row).find(
          (k) =>
            !["id", "user_id", "created_at", "updated_at"].includes(k) &&
            row[k] !== null &&
            ["string", "boolean", "number"].includes(typeof row[k]),
        );
        if (col) {
          const v = row[col];
          const tampered =
            typeof v === "string" ? `PWNED ${RUN}` : typeof v === "boolean" ? !v : Number(v) + 1;
          record(
            "table",
            t,
            `update B's ${col}`,
            await rest(
              a.token,
              "PATCH",
              `/${t}?${pk}=eq.${key}`,
              { [col]: tampered },
              { prefer: "return=representation" },
            ),
            [key],
          );
        }
        record(
          "table",
          t,
          "delete B's row",
          await rest(a.token, "DELETE", `/${t}?${pk}=eq.${key}`, undefined, {
            prefer: "return=representation",
          }),
          [key],
        );
      }
      record(
        "table",
        t,
        "insert a row attributed to B",
        await rest(
          a.token,
          "POST",
          `/${t}`,
          { user_id: b.id, course_id: bd.courseId },
          { prefer: "return=representation" },
        ),
        [b.id, bd.courseId],
      );
    }

    // ---- 2. Every RPC, with B's ids in every id-like parameter (and a random-id twin).
    const skipForA = new Set(["complete_onboarding"]); // would only change A's own profile
    for (const [name, def] of surf.rpcs) {
      if (skipForA.has(name)) continue;
      const build = (useB: boolean) => {
        const pick = (k: string): unknown => {
          const p = def.props[k] ?? {};
          const rnd = () => crypto.randomUUID();
          if (p.format === "uuid") {
            if (!useB) return rnd();
            if (/user/.test(k)) return b.id;
            if (/course/.test(k)) return bd.courseId;
            if (/assignment/.test(k)) return bd.assignmentIds[0];
            if (/upload/.test(k)) return bd.uploadId;
            if (/organization|org/.test(k)) return bd.orgId;
            if (/block/.test(k)) return bd.blockId;
            if (/token/.test(k)) return bd.pushTokenId;
            if (k === "p_id" || /session/.test(k)) return bd.sessionId;
            return bd.courseId;
          }
          if (p.type === "array") return useB ? [b.id, bd.courseId, bd.pushTokenId] : [rnd()];
          if (p.format?.startsWith("timestamp")) return new Date().toISOString();
          if (p.format === "date") return new Date().toISOString().slice(0, 10);
          if (p.format === "interval") return "01:00:00";
          if (p.type === "integer" || p.type === "number") return 1;
          if (p.type === "boolean") return false;
          if (p.format === "jsonb" || p.format === "json" || p.type === "object")
            return useB ? { user_id: b.id, course_id: bd.courseId } : {};
          // A push token is a device credential, not an id; presenting B's real one is the
          // device handoff, checked on its own at the end.
          if (/token/.test(k))
            return useB ? `ExponentPushToken[guess${RUN}]` : `ExponentPushToken[${RUN}]`;
          if (/join_code/.test(k)) return useB ? bd.joinCode : "NOPE0000";
          if (/provider/.test(k)) return "expo";
          if (/platform/.test(k)) return "ios";
          return useB ? MARK.toLowerCase() : "x";
        };
        return Object.fromEntries(Object.keys(def.props).map((k) => [k, pick(k)]));
      };
      const argsB = build(true);
      const supplied = Object.values(argsB)
        .flatMap((v) => (Array.isArray(v) ? v : [v]))
        .map(String);
      const rb = await rpc(a.token, name, argsB);
      // Two random-id twins: if they disagree with each other the RPC's answer is random
      // (a new join code or feed token), so only the leak check applies to it.
      const args1 = build(false);
      const args2 = build(false);
      const r1 = await rpc(a.token, name, args1);
      const r2 = await rpc(a.token, name, args2);
      const n1 = normalize(r1.text, Object.values(args1).map(String));
      const deterministic = n1 === normalize(r2.text, Object.values(args2).map(String));
      const extra: string[] = [];
      if (
        deterministic &&
        rb.status < 300 &&
        r1.status < 300 &&
        normalize(rb.text, supplied) !== n1
      ) {
        extra.push("answer depends on B's ids");
      }
      record("rpc", name, "B's ids as parameters", rb, supplied, extra);
    }

    // ---- 3. Every edge function, with B's ids in the body and query.
    const fns: string[] = [];
    for await (const e of Deno.readDir(FUNCTIONS_DIR)) {
      if (e.isDirectory && !e.name.startsWith("_")) fns.push(e.name);
    }
    fns.sort();
    const bodyB = {
      user_id: b.id,
      user_ids: [b.id],
      course_id: bd.courseId,
      assignment_id: bd.assignmentIds[0],
      upload_id: bd.uploadId,
      id: bd.sessionId,
      organization_id: bd.orgId,
      source: "file",
      file_path: bd.filePath,
      notes: `notes about cell biology for ${RUN} `.repeat(10),
      token: bd.feedToken,
      confirm: "DELETE",
    };
    const supplied = [
      b.id,
      bd.courseId,
      bd.assignmentIds[0]!,
      bd.uploadId,
      bd.sessionId,
      bd.filePath,
      bd.feedToken,
    ];
    const query = `?course_id=${bd.courseId}&user_id=${b.id}&upload_id=${bd.uploadId}&assignment_id=${bd.assignmentIds[0]}`;
    for (const fn of fns.filter((f) => f !== "delete-account")) {
      record(
        "function",
        fn,
        "POST with B's ids",
        await http(`${FUNCTIONS}/${fn}`, { method: "POST", token: a.token, body: bodyB }),
        supplied,
      );
      record(
        "function",
        fn,
        "GET with B's ids",
        await http(`${FUNCTIONS}/${fn}${query}`, { token: a.token }),
        supplied,
      );
      record(
        "function",
        fn,
        "GET B's upload by path",
        await http(`${FUNCTIONS}/${fn}/${bd.uploadId}`, { token: a.token }),
        supplied,
      );
    }

    // ---- 4. Storage.
    const st = (p: string) => `${API}/storage/v1${p}`;
    const bPath = bd.filePath;
    record(
      "storage",
      "syllabi",
      "download B's file",
      await http(st(`/object/syllabi/${bPath}`), { token: a.token }),
      [bPath],
    );
    record(
      "storage",
      "syllabi",
      "authenticated download",
      await http(st(`/object/authenticated/syllabi/${bPath}`), { token: a.token }),
      [bPath],
    );
    record(
      "storage",
      "syllabi",
      "public URL",
      await http(st(`/object/public/syllabi/${bPath}`), {}),
      [bPath],
    );
    record(
      "storage",
      "syllabi",
      "signed URL for B's file",
      await http(st(`/object/sign/syllabi/${bPath}`), {
        method: "POST",
        token: a.token,
        body: { expiresIn: 60 },
      }),
      [bPath],
    );
    record(
      "storage",
      "syllabi",
      "list B's folder",
      await http(st(`/object/list/syllabi`), {
        method: "POST",
        token: a.token,
        body: { prefix: `${b.id}/`, limit: 100 },
      }),
      [b.id],
    );
    record(
      "storage",
      "syllabi",
      "list the bucket root",
      await http(st(`/object/list/syllabi`), {
        method: "POST",
        token: a.token,
        body: { prefix: "", limit: 100 },
      }),
    );
    record(
      "storage",
      "syllabi",
      "search for B's file name",
      await http(st(`/object/list/syllabi`), {
        method: "POST",
        token: a.token,
        body: { prefix: `${b.id}/`, search: "syllabus", limit: 100 },
      }),
      [b.id],
    );
    record(
      "storage",
      "syllabi",
      "upload into B's folder",
      await http(st(`/object/syllabi/${b.id}/planted-${RUN}.pdf`), {
        method: "POST",
        token: a.token,
        headers: { "content-type": "application/pdf" },
        raw: new TextEncoder().encode("%PDF planted"),
      }),
      [b.id],
    );
    record(
      "storage",
      "syllabi",
      "overwrite B's file",
      await http(st(`/object/syllabi/${bPath}`), {
        method: "PUT",
        token: a.token,
        headers: { "content-type": "application/pdf", "x-upsert": "true" },
        raw: new TextEncoder().encode("%PDF overwritten"),
      }),
      [bPath],
    );
    record(
      "storage",
      "syllabi",
      "move B's file to A",
      await http(st(`/object/move`), {
        method: "POST",
        token: a.token,
        body: { bucketId: "syllabi", sourceKey: bPath, destinationKey: `${a.id}/stolen.pdf` },
      }),
      [bPath],
    );
    record(
      "storage",
      "syllabi",
      "copy B's file to A",
      await http(st(`/object/copy`), {
        method: "POST",
        token: a.token,
        body: { bucketId: "syllabi", sourceKey: bPath, destinationKey: `${a.id}/copied.pdf` },
      }),
      [bPath],
    );
    record(
      "storage",
      "syllabi",
      "delete B's file",
      await http(st(`/object/syllabi`), {
        method: "DELETE",
        token: a.token,
        body: { prefixes: [bPath] },
      }),
      [bPath],
    );
    for (const guess of [
      `${b.id}/syllabus.pdf`,
      `${b.id}/${bd.uploadId}.pdf`,
      `${bd.uploadId}.pdf`,
    ]) {
      record(
        "storage",
        "syllabi",
        `guess path ${guess.replace(b.id, "<B>")}`,
        await http(st(`/object/authenticated/syllabi/${guess}`), { token: a.token }),
        [guess],
      );
    }
    const stillThere = await http(st(`/object/authenticated/syllabi/${bPath}`), { headers: svc });
    findings.push({
      area: "storage",
      path: "syllabi",
      attempt: "B's file unchanged afterwards",
      status: stillThere.status,
      ok: stillThere.status === 200 && stillThere.text.includes(MARK),
      detail:
        stillThere.status === 200 && stillThere.text.includes(MARK)
          ? ""
          : "B's file was changed or removed",
    });

    // ---- 5. ICS feed: guessed and derived tokens.
    const guesses = [
      crypto.randomUUID(),
      b.id,
      bd.courseId,
      bd.feedToken.slice(0, -1) + (bd.feedToken.endsWith("a") ? "b" : "a"),
      bd.feedToken.toUpperCase(),
      "0".repeat(bd.feedToken.length),
      "",
    ];
    for (const g of guesses) {
      record(
        "ics",
        "calendar-feed",
        `token ${g === bd.feedToken.toUpperCase() ? "B's in caps" : g.slice(0, 8) || "(empty)"}`,
        await http(`${FUNCTIONS}/calendar-feed/${g}.ics`, {}),
        [g],
      );
      record(
        "ics",
        "calendar-feed",
        `?token= ${g.slice(0, 8) || "(empty)"}`,
        await http(`${FUNCTIONS}/calendar-feed?token=${encodeURIComponent(g)}`, {}),
        [g],
      );
    }
    const aFeed = String((await rpc(a.token, "rotate_calendar_token", {})).json);
    record(
      "ics",
      "calendar-feed",
      "A's own feed has none of B's events",
      await http(`${FUNCTIONS}/calendar-feed/${aFeed}.ics`, {}),
    );

    // ---- 6. Exports.
    record(
      "export",
      "export-data",
      "A's export",
      await http(`${FUNCTIONS}/export-data`, { token: a.token }),
    );
    for (const format of ["anki", "quizlet"]) {
      record(
        "export",
        "export-cards",
        `B's course as ${format}`,
        await http(`${FUNCTIONS}/export-cards?course_id=${bd.courseId}&format=${format}`, {
          token: a.token,
        }),
        [bd.courseId],
      );
    }

    // ---- 7. Linking A's things to B's course or assignment.
    const link = (attempt: string, r: Res) => {
      const accepted = r.status < 300 && !(Array.isArray(r.json) && r.json.length === 0);
      findings.push({
        area: "link",
        path: attempt.split(" ")[0]!,
        attempt,
        status: r.status,
        ok: !accepted,
        detail: accepted ? "accepted" : "",
      });
    };
    const ret = { prefer: "return=representation" };
    link(
      "start_study_session on A's course with B's assignment",
      await rpc(a.token, "start_study_session", {
        p_id: crypto.randomUUID(),
        p_course_id: aCourse.id,
        p_assignment_id: bd.assignmentIds[0],
      }),
    );
    link(
      "start_study_session on B's course",
      await rpc(a.token, "start_study_session", {
        p_id: crypto.randomUUID(),
        p_course_id: bd.courseId,
      }),
    );
    link(
      "study_sessions insert with B's assignment",
      await rest(
        a.token,
        "POST",
        "/study_sessions",
        {
          course_id: aCourse.id,
          assignment_id: bd.assignmentIds[0],
          started_at: new Date(Date.now() - 36e5).toISOString(),
          ended_at: new Date().toISOString(),
        },
        ret,
      ),
    );
    link(
      "assignment_resources insert on B's assignment",
      await rest(
        a.token,
        "POST",
        "/assignment_resources",
        { assignment_id: bd.assignmentIds[0], kind: "other", url: "https://example.com" },
        ret,
      ),
    );
    link(
      "assignments insert into B's course",
      await rest(
        a.token,
        "POST",
        "/assignments",
        { course_id: bd.courseId, title: "planted" },
        ret,
      ),
    );
    link(
      "assignments move A's assignment into B's course",
      await rest(
        a.token,
        "PATCH",
        `/assignments?id=eq.${aAssignment.id}`,
        { course_id: bd.courseId },
        ret,
      ),
    );
    link(
      "grade_categories insert into B's course",
      await rest(
        a.token,
        "POST",
        "/grade_categories",
        { course_id: bd.courseId, name: "planted", weight: 10 },
        ret,
      ),
    );
    link(
      "flashcards insert into B's course",
      await rest(
        a.token,
        "POST",
        "/flashcards",
        { course_id: bd.courseId, front: "q", back: "a" },
        ret,
      ),
    );
    link(
      "flashcards on A's course with B's assignment",
      await rest(
        a.token,
        "POST",
        "/flashcards",
        { course_id: aCourse.id, assignment_id: bd.assignmentIds[0], front: "q", back: "a" },
        ret,
      ),
    );
    const aCard = one<{ id: string }>(
      await rest(
        a.token,
        "POST",
        "/flashcards",
        { course_id: aCourse.id, front: "q", back: "a" },
        ret,
      ),
      "A card",
    );
    link(
      "flashcards move A's card onto B's assignment",
      await rest(
        a.token,
        "PATCH",
        `/flashcards?id=eq.${aCard.id}`,
        { assignment_id: bd.assignmentIds[0] },
        ret,
      ),
    );
    const aSession = crypto.randomUUID();
    must(
      await rpc(a.token, "start_study_session", {
        p_id: aSession,
        p_course_id: aCourse.id,
        p_started_at: new Date(Date.now() - 20 * 60e3).toISOString(),
      }),
      "A session",
    );
    must(await rpc(a.token, "stop_study_session", { p_id: aSession }), "A session stop");
    link(
      "study_sessions move A's session onto B's assignment",
      await rest(
        a.token,
        "PATCH",
        `/study_sessions?id=eq.${aSession}`,
        { assignment_id: bd.assignmentIds[0] },
        ret,
      ),
    );
    link(
      "study_sessions move A's session into B's course",
      await rest(
        a.token,
        "PATCH",
        `/study_sessions?id=eq.${aSession}`,
        { course_id: bd.courseId },
        ret,
      ),
    );
    link(
      "assignment_resources on A's course with B's assignment",
      await rest(
        a.token,
        "POST",
        "/assignment_resources",
        {
          assignment_id: bd.assignmentIds[0],
          course_id: aCourse.id,
          kind: "other",
          url: "https://example.com/x",
        },
        ret,
      ),
    );
    link(
      "study_blocks on A's course with B's assignment",
      await rest(
        a.token,
        "POST",
        "/study_blocks",
        {
          user_id: a.id,
          course_id: aCourse.id,
          assignment_id: bd.assignmentIds[0],
          starts_at: new Date(Date.now() + 36e5).toISOString(),
          ends_at: new Date(Date.now() + 72e5).toISOString(),
        },
        ret,
      ),
    );
    link(
      "course_meetings insert into B's course",
      await rest(
        a.token,
        "POST",
        "/course_meetings",
        { course_id: bd.courseId, weekday: 1, start_time: "09:00", end_time: "10:00" },
        ret,
      ),
    );
    link(
      "study_blocks insert on B's course",
      await rest(
        a.token,
        "POST",
        "/study_blocks",
        {
          user_id: a.id,
          course_id: bd.courseId,
          starts_at: new Date().toISOString(),
          ends_at: new Date(Date.now() + 36e5).toISOString(),
        },
        ret,
      ),
    );

    // ---- 8. Organization admin C: aggregate hours only.
    for (const t of [
      "assignments",
      "courses",
      "grade_categories",
      "study_sessions",
      "study_blocks",
      "weekly_focus_by_course",
      "assignment_grade_shares",
      "syllabus_uploads",
      "flashcards",
      "profiles",
    ]) {
      record(
        "org-admin",
        t,
        "admin reads a member's rows",
        await rest(c.token, "GET", `/${t}?select=*`),
        [],
        [],
        true,
      );
    }
    record(
      "org-admin",
      "course_current_grade",
      "admin asks for a member's grade",
      await rpc(c.token, "course_current_grade", { p_course_id: bd.courseId }),
      [bd.courseId],
      [],
      true,
    );
    const grade = await rpc(c.token, "course_current_grade", { p_course_id: bd.courseId });
    findings.push({
      area: "org-admin",
      path: "course_current_grade",
      attempt: "result is empty",
      status: grade.status,
      ok: grade.status >= 400 || grade.json === null,
      detail: grade.status < 400 && grade.json !== null ? `returned ${grade.text}` : "",
    });
    // Members are listed by user id (so the admin can manage them) and name; nothing else of B's.
    record(
      "org-admin",
      "organization_roster",
      "roster has no study data",
      await rpc(c.token, "organization_roster", { p_organization_id: bd.orgId }),
      [bd.orgId, b.id],
      [],
      true,
    );
    const roster = await rpc(c.token, "organization_roster", { p_organization_id: bd.orgId });
    const rosterKeys =
      Array.isArray(roster.json) && roster.json[0]
        ? Object.keys(roster.json[0] as object)
            .sort()
            .join(",")
        : "";
    findings.push({
      area: "org-admin",
      path: "organization_roster",
      attempt: "only name, role, sharing, joined",
      status: roster.status,
      ok: rosterKeys === "display_name,joined_at,role,share_focus_hours,user_id",
      detail: rosterKeys,
    });
    record(
      "org-admin",
      "org_focus_summary",
      "aggregate hours only",
      await rpc(c.token, "org_focus_summary", { p_organization_id: bd.orgId, p_weeks: 4 }),
      [bd.orgId],
      [],
      true,
    );
    record(
      "org-admin",
      "get_stats_overview",
      "admin's own stats",
      await rpc(c.token, "get_stats_overview", {}),
      [],
      [],
      true,
    );

    // ---- 9. Last: A deletes their own account, naming B in the body.
    record(
      "function",
      "delete-account",
      "A deletes, naming B",
      await http(`${FUNCTIONS}/delete-account`, {
        method: "POST",
        token: a.token,
        body: { confirm: "DELETE", user_id: b.id },
      }),
      [b.id],
    );

    // ---- Nothing of B's changed, and nothing new is attributed to B.
    const after = await snapshotOfB(surf.tables, b.id);
    for (const t of new Set([...before.keys(), ...after.keys()])) {
      const x = before.get(t) ?? [];
      const y = after.get(t) ?? [];
      const same = x.length === y.length && x.every((row, i) => row === y[i]);
      findings.push({
        area: "integrity",
        path: t,
        attempt: "B's rows unchanged",
        status: 0,
        ok: same,
        detail: same
          ? ""
          : `${x.length} rows before, ${y.length} after${x.length === y.length ? " (values changed)" : ""}`,
      });
    }

    // ---- Device handoff: someone holding B's device signs in (C here, since A is gone).
    // The token moves to them, as a new row: B's row id, device id, and keys are not
    // returned or carried over, and B stops getting notifications on that device.
    const handoff = await rpc(c.token, "register_push_token", {
      p_provider: "expo",
      p_token: bd.pushToken,
      p_platform: "ios",
    });
    record(
      "rpc",
      "register_push_token",
      "device handoff with B's real token",
      handoff,
      [bd.pushToken],
      handoff.status < 300 && handoff.json === bd.pushTokenId ? ["returned B's row id"] : [],
    );
    const moved = (await service(
      "GET",
      `/rest/v1/notification_tokens?select=user_id,device_id&token=eq.${encodeURIComponent(bd.pushToken)}`,
    )) as { user_id: string; device_id: string | null }[];
    findings.push({
      area: "rpc",
      path: "register_push_token",
      attempt: "handoff leaves B nothing on the device and carries nothing over",
      status: handoff.status,
      ok: moved.length === 1 && moved[0]!.user_id === c.id && moved[0]!.device_id === null,
      detail: JSON.stringify(moved),
    });

    // Clean up the test users (B's and C's data cascades).
    for (const u of [b, c])
      await http(`${API}/auth/v1/admin/users/${u.id}`, { method: "DELETE", headers: svc });
    await http(`${API}/auth/v1/admin/users/${a.id}`, { method: "DELETE", headers: svc });

    // ---- Report.
    const failed = findings.filter((f) => !f.ok);
    const byArea = new Map<string, { total: number; failed: number }>();
    for (const f of findings) {
      const s = byArea.get(f.area) ?? { total: 0, failed: 0 };
      s.total++;
      if (!f.ok) s.failed++;
      byArea.set(f.area, s);
    }
    const lines = [
      `# Cross-user access report (${new Date().toISOString()})`,
      "",
      `${findings.length} attempts across ${surf.tables.length} tables and views, ${surf.rpcs.size} RPCs, ${fns.length} edge functions, storage, the ICS feed, exports, linking, and organization admin access.`,
      "",
      "| Area | Attempts | Failed |",
      "| --- | --- | --- |",
      ...[...byArea].map(([area, s]) => `| ${area} | ${s.total} | ${s.failed} |`),
      "",
      failed.length ? "## Failed paths" : "## Failed paths\n\nNone.",
      ...failed.map(
        (f) => `- **${f.area} ${f.path}**: ${f.attempt} → HTTP ${f.status}: ${f.detail}`,
      ),
      "",
      "## Every attempt",
      "",
      "| Area | Path | Attempt | Status | Result |",
      "| --- | --- | --- | --- | --- |",
      ...findings.map(
        (f) =>
          `| ${f.area} | ${f.path} | ${f.attempt} | ${f.status} | ${f.ok ? "ok" : `FAIL: ${f.detail}`} |`,
      ),
    ];
    await Deno.writeTextFile(REPORT, lines.join("\n") + "\n");
    console.log(lines.slice(0, 20 + failed.length).join("\n"));
    assertEquals(
      failed.map((f) => `${f.area} ${f.path}: ${f.attempt} (${f.status}) ${f.detail}`),
      [],
    );
  },
});
