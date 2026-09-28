// Removes content named in a copyright notice (launch safety S17). Run by an operator
// with the production service-role key in the environment (never pasted anywhere else):
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/takedown.mjs <syllabus_upload|flashcard|assignment_resource> <id> \
//       --notice "<ticket or email id>" --received 2026-10-01 [--reason "..."]
//
// For a syllabus upload it also deletes the stored file. Every run is recorded in
// private.content_takedowns and prints the owner's prior takedown count (repeat-infringer
// policy). See docs/takedowns.md.
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    notice: { type: "string" },
    received: { type: "string" },
    reason: { type: "string" },
  },
});
const [type, id] = positionals;
const TYPES = ["syllabus_upload", "flashcard", "assignment_resource"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!TYPES.includes(type) || !UUID.test(id ?? "") || !values.notice || !values.received) {
  console.error(
    "usage: node scripts/takedown.mjs <syllabus_upload|flashcard|assignment_resource> <id> --notice REF --received YYYY-MM-DD [--reason TEXT]",
  );
  process.exit(2);
}
const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(2);
}
const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

async function call(method, path, body) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

if (type === "syllabus_upload") {
  const rows = await call("GET", `/rest/v1/syllabus_uploads?id=eq.${id}&select=file_path`);
  const path = rows?.[0]?.file_path;
  if (path) {
    await call("DELETE", `/storage/v1/object/syllabi`, { prefixes: [path] });
    console.log(`Deleted stored file ${path}`);
  }
}
const owner = await call("POST", "/rest/v1/rpc/takedown_content", {
  p_target_type: type,
  p_target_id: id,
  p_notice_ref: values.notice,
  p_received_at: new Date(values.received).toISOString(),
  p_reason: values.reason ?? null,
});
if (!owner) {
  console.log("Nothing to remove (already gone). The notice was still recorded.");
} else {
  const count = await call("POST", "/rest/v1/rpc/takedown_count", { p_user_id: owner });
  console.log(`Removed ${type} ${id} (owner ${owner}). Takedowns for this account: ${count}.`);
  if (count >= 3)
    console.log("Repeat infringer: review the account for closure (docs/takedowns.md).");
}
