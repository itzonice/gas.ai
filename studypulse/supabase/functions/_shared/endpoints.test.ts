// Launch safety S30: every edge function authenticates, validates its input with zod, and
// is rate limited. Checks each function's source against its declaration in endpoints.ts.
import { assert, assertEquals } from "@std/assert";

import { ENDPOINTS, type EndpointAuth } from "./endpoints.ts";
import { FUNCTION_LIMITS } from "./rate-limit.ts";

const root = new URL("../", import.meta.url);

async function functionSources(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for await (const e of Deno.readDir(root)) {
    if (!e.isDirectory || e.name.startsWith("_")) continue;
    out.set(e.name, await Deno.readTextFile(new URL(`${e.name}/index.ts`, root)));
  }
  return out;
}

const sources = await functionSources();

/** What each kind of auth looks like in the source. */
const AUTH_CALLS: Record<Exclude<EndpointAuth, "url-token" | "public">, RegExp> = {
  user: /\brequireUser\(/,
  admin: /\brequireAdmin\(/,
  cron: /\brequireCron\(/,
  "oauth-state": /\boauthCallbackQuery\b/,
  "stripe-signature": /\bverifyStripeSignature\(/,
  "shared-secret": /\bsafeEqual\(/,
};

/** Reading request data without zod in between. */
const RAW_READS = [
  { what: "req.json()", re: /\breq\.json\(\)/ },
  { what: "req.formData()", re: /\breq\.formData\(\)/ },
  { what: "req.arrayBuffer()", re: /\breq\.arrayBuffer\(\)/ },
  { what: "req.blob()", re: /\breq\.blob\(\)/ },
  { what: "searchParams", re: /\bsearchParams\b/ },
];

Deno.test("every function is declared, and every declaration is a function", () => {
  assertEquals(
    [...sources.keys()].sort(),
    Object.keys(ENDPOINTS).sort(),
    "declare new functions in _shared/endpoints.ts (auth and input), and remove deleted ones",
  );
});

Deno.test("every function runs through createHandler and has rate limits", () => {
  for (const [name, source] of sources) {
    assert(
      source.includes(`createHandler("${name}"`),
      `${name}: use createHandler("${name}", …) so the IP rate limit applies`,
    );
    const limits = FUNCTION_LIMITS[name];
    assert(limits, `${name}: add it to FUNCTION_LIMITS`);
    const auth = ENDPOINTS[name]!.auth;
    if (auth.includes("user") || auth.includes("admin")) {
      assert(limits.user, `${name}: signed-in callers need a per-user limit`);
    }
  }
});

Deno.test("every function authenticates the way it declares, and only that way", () => {
  for (const [name, source] of sources) {
    const { auth, tokenCheck, publicReason } = ENDPOINTS[name]!;
    assert(auth.length > 0, `${name}: declare how callers authenticate`);
    for (const [kind, re] of Object.entries(AUTH_CALLS)) {
      assertEquals(
        re.test(source),
        auth.includes(kind as EndpointAuth),
        `${name}: ${kind} auth is ${re.test(source) ? "used but not declared" : "declared but not called"}`,
      );
    }
    if (auth.includes("url-token")) {
      assert(
        tokenCheck && source.includes(tokenCheck),
        `${name}: name the call that checks the token`,
      );
    }
    if (auth.includes("public")) {
      assertEquals(auth, ["public"], `${name}: public means no other auth`);
      assert(publicReason && publicReason.length > 20, `${name}: say why it's public`);
      assertEquals(ENDPOINTS[name]!.input, ["none"], `${name}: a public endpoint takes no input`);
    }
  }
});

Deno.test("request input is only read through zod", () => {
  for (const [name, source] of sources) {
    const { input, auth } = ENDPOINTS[name]!;
    for (const { what, re } of RAW_READS) {
      assert(!re.test(source), `${name}: reads ${what} directly; use parseJsonBody or parseQuery`);
    }
    assertEquals(/\bparseJsonBody\(/.test(source), input.includes("json"), `${name}: json input`);
    assertEquals(/\bparseQuery\(/.test(source), input.includes("query"), `${name}: query input`);
    const rawText = /\breq\.text\(\)/.test(source);
    assertEquals(rawText, input.includes("raw-signed"), `${name}: raw body`);
    if (rawText) {
      assert(auth.includes("stripe-signature"), `${name}: a raw body is only for signature checks`);
      assert(/\.parse\(/.test(source), `${name}: parse the verified body with a schema`);
    }
    if (input.includes("none")) assertEquals(input, ["none"], `${name}: none means none`);
  }
});

/** Request schemas declared outside the function, and the file that declares them. */
const IMPORTED_SCHEMAS: Record<string, string> = {
  checkoutInputSchema: "../../../packages/core/src/billing/plans.ts",
  oauthCallbackQuery: "./http.ts",
  revenueCatWebhookSchema: "../../../packages/core/src/billing/revenuecat.ts",
};

/** The text of `const <name> = …` up to the end of the statement. */
function declaration(source: string, name: string): string | null {
  const start = source.search(new RegExp(`(?:const|let) ${name}\\b[^=]*=`));
  if (start < 0) return null;
  const end = source.indexOf(";\n", start);
  return source.slice(start, end < 0 ? undefined : end);
}

const isStrict = (text: string) => /\bstrictObject\(|\.strict\(\)/.test(text);

Deno.test("request schemas refuse unknown keys unless the endpoint says why (S34)", async () => {
  for (const [name, source] of sources) {
    const loose: string[] = [];
    for (const m of source.matchAll(/parse(?:JsonBody|Query)\(\s*req,\s*(z\.\w+\(|\w+)/g)) {
      const ref = m[1]!;
      let text: string | null;
      if (ref.startsWith("z.")) text = ref;
      else if (ref in IMPORTED_SCHEMAS) {
        const file = await Deno.readTextFile(new URL(IMPORTED_SCHEMAS[ref]!, import.meta.url));
        text = declaration(file, ref);
      } else text = declaration(source, ref);
      assert(text, `${name}: can't find the declaration of ${ref}`);
      if (!isStrict(text)) loose.push(ref);
    }
    const reason = ENDPOINTS[name]!.looseInput;
    if (loose.length > 0) {
      assert(reason, `${name}: ${loose.join(", ")} accept unknown keys; make them strict`);
    } else {
      assertEquals(reason, undefined, `${name}: every schema is strict; drop looseInput`);
    }
  }
});
