import { describe, expect, it } from "vitest";

import { assertSafeUrl, isPublicIp, safeFetch, UnsafeUrlError } from "./ssrf.ts";

describe("isPublicIp", () => {
  it.each([
    "10.1.2.3",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "198.18.0.1",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "64:ff9b::a00:1",
    "2002:c0a8:101::1",
    "not-an-ip",
    "1.2.3",
    "1.2.3.256",
  ])("blocks %s", (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it.each([
    "8.8.8.8",
    "172.32.0.1",
    "151.101.1.69",
    "2606:4700::6810:84e5",
    "::ffff:8.8.8.8",
    "[2607:f8b0:4004:c07::64]",
  ])("allows %s", (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });
});

describe("assertSafeUrl", () => {
  it.each([
    "ftp://example.com/syllabus.pdf",
    "file:///etc/passwd",
    "http://user:pass@example.com/",
    "http://example.com:8080/",
    "http://localhost/",
    "http://printer.local/",
    "http://metadata.google.internal/",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://intranet/",
    "http://0x7f000001/",
    "not a url",
  ])("rejects %s", (url) => {
    expect(() => assertSafeUrl(url)).toThrow(UnsafeUrlError);
  });

  it("accepts ordinary public URLs", () => {
    expect(assertSafeUrl("https://canvas.example.edu/courses/1/syllabus").hostname).toBe(
      "canvas.example.edu",
    );
  });
});

describe("safeFetch", () => {
  const publicDns = () => Promise.resolve(["93.184.216.34"]);

  function fakeFetch(routes: Record<string, () => Response>) {
    const seen: string[] = [];
    const impl = ((input: URL | string) => {
      const url = String(input);
      seen.push(url);
      const route = routes[url];
      return Promise.resolve(route ? route() : new Response("not found", { status: 404 }));
    }) as typeof fetch;
    return { impl, seen };
  }

  it("fetches a public page", async () => {
    const { impl } = fakeFetch({
      "https://example.edu/syllabus": () =>
        new Response("<p>Hi</p>", { headers: { "content-type": "text/html" } }),
    });
    const res = await safeFetch("https://example.edu/syllabus", {
      resolve: publicDns,
      fetch: impl,
    });
    expect(new TextDecoder().decode(res.bytes)).toBe("<p>Hi</p>");
    expect(res.contentType).toBe("text/html");
  });

  it("rejects hosts that resolve to private addresses (DNS rebinding to internal IPs)", async () => {
    const { impl, seen } = fakeFetch({});
    await expect(
      safeFetch("https://evil.example.com/", {
        resolve: () => Promise.resolve(["93.184.216.34", "10.0.0.5"]),
        fetch: impl,
      }),
    ).rejects.toThrow("private address");
    expect(seen).toEqual([]);
  });

  it("re-checks every redirect hop", async () => {
    const { impl, seen } = fakeFetch({
      "https://example.edu/go": () =>
        new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest" } }),
    });
    await expect(
      safeFetch("https://example.edu/go", { resolve: publicDns, fetch: impl }),
    ).rejects.toThrow(UnsafeUrlError);
    expect(seen).toEqual(["https://example.edu/go"]);
  });

  it("follows safe redirects up to the limit", async () => {
    const { impl } = fakeFetch({
      "https://example.edu/a": () =>
        new Response(null, { status: 301, headers: { location: "/b" } }),
      "https://example.edu/b": () => new Response("ok"),
    });
    const res = await safeFetch("https://example.edu/a", { resolve: publicDns, fetch: impl });
    expect(res.finalUrl).toBe("https://example.edu/b");

    const loop = fakeFetch({
      "https://example.edu/loop": () =>
        new Response(null, { status: 302, headers: { location: "/loop" } }),
    });
    await expect(
      safeFetch("https://example.edu/loop", { resolve: publicDns, fetch: loop.impl }),
    ).rejects.toThrow("Too many redirects");
  });

  it("caps the response size even without content-length", async () => {
    const big = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(new Uint8Array(1024));
        controller.close();
      },
    });
    const { impl } = fakeFetch({ "https://example.edu/big": () => new Response(big) });
    await expect(
      safeFetch("https://example.edu/big", { resolve: publicDns, fetch: impl, maxBytes: 4096 }),
    ).rejects.toThrow("too large");
  });

  it("times out slow servers", async () => {
    const slow = ((_: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      })) as typeof fetch;
    await expect(
      safeFetch("https://example.edu/slow", { resolve: publicDns, fetch: slow, timeoutMs: 20 }),
    ).rejects.toThrow("too long");
  });
});
