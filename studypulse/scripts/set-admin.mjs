// Grants or removes the admin role (launch safety S32). The role lives in the user's
// app_metadata, which only the service role can change. Run by an operator with the
// production service-role key in the environment (never pasted anywhere else):
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/set-admin.mjs <user-id> grant|revoke
//
// Takes effect on the user's next request (the checks read the live value, not the JWT).
// Other app_metadata keys (the sign-in provider) are left as they are.
const [userId, action] = process.argv.slice(2);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID.test(userId ?? "") || !["grant", "revoke"].includes(action)) {
  console.error("usage: node scripts/set-admin.mjs <user-id> grant|revoke");
  process.exit(2);
}
const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.");
  process.exit(2);
}
const headers = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };

const get = await fetch(`${url}/auth/v1/admin/users/${userId}`, { headers });
if (!get.ok) {
  console.error(`No such user (${String(get.status)}).`);
  process.exit(1);
}
// The auth server merges app_metadata on update, so a key is removed by setting it to null.
const appMetadata = { role: action === "grant" ? "admin" : null };

const put = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
  method: "PUT",
  headers,
  body: JSON.stringify({ app_metadata: appMetadata }),
});
if (!put.ok) {
  console.error(`Update failed (${String(put.status)}): ${await put.text()}`);
  process.exit(1);
}
console.log(`${action === "grant" ? "Granted" : "Removed"} admin for ${userId}.`);
