import { assert, assertEquals, assertMatch } from "@std/assert";

import { createHandler } from "./handler.ts";

function silenceConsole() {
  const original = { log: console.log, warn: console.warn, error: console.error };
  const lines: string[] = [];
  console.log = console.warn = console.error = (line: string) => lines.push(line);
  return {
    lines,
    restore: () => Object.assign(console, original),
  };
}

Deno.test("echoes a safe incoming request id and logs it", async () => {
  const out = silenceConsole();
  try {
    const handler = createHandler("test-fn", (_req, { log, requestId }) => {
      log.info("inside", { requestId });
      return Response.json({ ok: true });
    });
    const res = await handler(
      new Request("http://localhost/test-fn", { headers: { "x-request-id": "req-abcdefgh" } }),
    );
    assertEquals(res.headers.get("x-request-id"), "req-abcdefgh");
    const entries = out.lines.map((l) => JSON.parse(l));
    assert(entries.every((e) => e.request_id === "req-abcdefgh" && e.fn === "test-fn"));
    assertEquals(entries.at(-1).msg, "request completed");
    assertEquals(entries.at(-1).status, 200);
  } finally {
    out.restore();
  }
});

Deno.test("turns thrown errors into a 500 that carries the request id", async () => {
  const out = silenceConsole();
  try {
    const handler = createHandler("test-fn", () => {
      throw new Error("secret internals");
    });
    const res = await handler(new Request("http://localhost/test-fn"));
    assertEquals(res.status, 500);
    const body = await res.json();
    assertEquals(body.error, "internal_error");
    assertMatch(body.request_id, /^[0-9a-f-]{36}$/);
    assertEquals(res.headers.get("x-request-id"), body.request_id);
    assert(!JSON.stringify(body).includes("secret internals"));
  } finally {
    out.restore();
  }
});
