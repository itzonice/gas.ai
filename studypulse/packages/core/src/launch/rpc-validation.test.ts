// Launch safety S30: every database RPC the apps can call goes through the typed API client
// (packages/core/src/api/client.ts), and every argument passed to it is validated with zod
// first. The database checks who is calling (SQL test 670); this checks the input.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const client = readFileSync(join(root, "packages/core/src/api/client.ts"), "utf8");

/** Arguments that come from the server itself, not the caller, with the reason. */
const SERVER_DERIVED: Record<string, string> = {
  is_pro: "p_user_id is the verified user from auth.getUser(), not caller input",
};

interface RpcCall {
  name: string;
  hasArgs: boolean;
  /** The method body from its start up to the end of the rpc(...) call. */
  body: string;
}

function rpcCalls(source: string): RpcCall[] {
  const lines = source.split("\n");
  const calls: RpcCall[] = [];
  const re = /\.rpc\(\s*"([a-z_]+)"\s*(,|\))/g;
  for (const m of source.matchAll(re)) {
    const lineNo = source.slice(0, m.index).split("\n").length - 1;
    // Methods are declared at six spaces of indentation inside createApiClient's object.
    let start = lineNo;
    while (start > 0 && !/^ {6}(?:async\s+)?[a-zA-Z]+\(/.test(lines[start] ?? "")) start--;
    const end = source.indexOf(")", m.index + m[0].length) + 1;
    const methodStart = source.split("\n").slice(0, start).join("\n").length;
    calls.push({ name: m[1]!, hasArgs: m[2] === ",", body: source.slice(methodStart, end) });
  }
  return calls;
}

function* appSources(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".expo", "dist"].includes(entry)) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) yield* appSources(path);
    else if (/\.(tsx?)$/.test(entry) && !entry.includes(".test.")) yield path;
  }
}

describe("RPC input validation (S30)", () => {
  const calls = rpcCalls(client);

  it("finds the client's RPC calls", () => {
    expect(calls.length).toBeGreaterThan(25);
  });

  it("validates every caller-supplied argument with zod before calling", () => {
    const unvalidated = calls
      .filter((c) => c.hasArgs && !(c.name in SERVER_DERIVED))
      .filter((c) => !/\bvalidate\(/.test(c.body))
      .map((c) => c.name);
    expect(unvalidated).toEqual([]);
  });

  it("apps call RPCs only through the API client", () => {
    const direct = [...appSources(join(root, "apps/web")), ...appSources(join(root, "apps/mobile"))]
      .filter((p) => readFileSync(p, "utf8").includes(".rpc("))
      .map((p) => relative(root, p));
    expect(direct).toEqual([]);
  });
});
