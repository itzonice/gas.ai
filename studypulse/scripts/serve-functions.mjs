// Serves every edge function with the Deno CLI behind one router, for environments where
// the Supabase edge-runtime container can't start (for example a sandbox without registry
// access). CI and `pnpm local` use the real runtime from `supabase start`; this is only a
// fallback for running the end-to-end suites.
//
//   node scripts/serve-functions.mjs          # router on http://127.0.0.1:54390
//   FUNCTIONS_URL=http://127.0.0.1:54390/functions/v1 pnpm test:cross-user
//
// Requests to /functions/v1/<name>/... are forwarded to that function's own process with
// the path the real runtime would give it (/<name>/...).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import http from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const fnDir = join(root, "supabase/functions");
const deno = existsSync(join(root, "node_modules/deno/deno"))
  ? join(root, "node_modules/deno/deno")
  : "deno";
const ROUTER_PORT = Number(process.env.ROUTER_PORT ?? 54390);

const status = JSON.parse(
  execFileSync("npx", ["supabase", "status", "-o", "json"], { cwd: root, encoding: "utf8" }),
);
const dotenv = existsSync(join(fnDir, ".env"))
  ? Object.fromEntries(
      readFileSync(join(fnDir, ".env"), "utf8")
        .split("\n")
        .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l.trim()))
        .filter(Boolean)
        .map((m) => [m[1], m[2]]),
    )
  : {};

const names = readdirSync(fnDir, { withFileTypes: true })
  .filter(
    (d) =>
      d.isDirectory() && !d.name.startsWith("_") && existsSync(join(fnDir, d.name, "index.ts")),
  )
  .map((d) => d.name);

const ports = new Map();
const children = [];
names.forEach((name, i) => {
  const port = 9100 + i;
  ports.set(name, port);
  const child = spawn(deno, ["run", "--allow-all", "--quiet", `${name}/index.ts`], {
    cwd: fnDir,
    env: {
      ...process.env,
      ...dotenv,
      SUPABASE_URL: status.API_URL,
      SUPABASE_ANON_KEY: status.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`,
      ...(existsSync("/root/.ccr/ca-bundle.crt") ? { DENO_CERT: "/root/.ccr/ca-bundle.crt" } : {}),
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  children.push(child);
});

const server = http.createServer((req, res) => {
  const m = /^\/functions\/v1\/([a-z0-9-]+)(\/.*)?$/.exec(req.url.split("?")[0] ?? "");
  const port = m ? ports.get(m[1]) : undefined;
  if (!m || !port) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }
  const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const upstream = http.request(
    {
      host: "127.0.0.1",
      port,
      method: req.method,
      path: `/${m[1]}${m[2] ?? ""}${query}`,
      headers: req.headers,
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "function_unavailable", function: m[1] }));
  });
  req.pipe(upstream);
});
server.listen(ROUTER_PORT, "127.0.0.1", () => {
  console.log(`${names.length} functions behind http://127.0.0.1:${ROUTER_PORT}/functions/v1`);
});

const stop = () => {
  for (const c of children) c.kill();
  server.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
