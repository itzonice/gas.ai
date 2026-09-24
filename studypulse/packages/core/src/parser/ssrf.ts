// SSRF protection for fetching user-supplied syllabus URLs. A URL is only fetched
// if it is http(s) on a default port and every address its host resolves to is a
// public unicast address. Redirects are followed manually and re-checked each hop.

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

function ipv4InRange(octets: number[], base: string, bits: number): boolean {
  const b = parseIPv4(base);
  if (!b) return false;
  const toInt = (o: number[]) => o.reduce((acc, octet) => ((acc << 8) | octet) >>> 0, 0);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toInt(octets) & mask) === (toInt(b) & mask);
}

const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function isPublicIPv4(octets: number[]): boolean {
  return !BLOCKED_V4.some(([base, bits]) => ipv4InRange(octets, base, bits));
}

type IPv6Groups = [number, number, number, number, number, number, number, number];

/** Expands an IPv6 address to 8 16-bit groups, or null if invalid. */
function parseIPv6(ip: string): IPv6Groups | null {
  let addr = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = addr.indexOf("%");
  if (zone !== -1) addr = addr.slice(0, zone);
  // Embedded IPv4 tail (e.g. ::ffff:10.0.0.1) becomes two hex groups.
  const v4Match = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (v4Match?.[1]) {
    const v4 = parseIPv4(v4Match[1]);
    if (!v4) return null;
    const [a = 0, b = 0, c = 0, d = 0] = v4;
    addr = `${addr.slice(0, -v4Match[1].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16)) as IPv6Groups;
}

function isPublicIPv6(g: IPv6Groups): boolean {
  const [g0, g1, g2, , , g5, g6, g7] = g;
  const embeddedV4 = (hi: number, lo: number) =>
    isPublicIPv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff]);
  if (g.every((x) => x === 0)) return false; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g7 === 1) return false; // ::1
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d
  if (g.slice(0, 5).every((x) => x === 0) && (g5 === 0xffff || g5 === 0)) return embeddedV4(g6, g7);
  if (g0 === 0x64 && g1 === 0xff9b) return embeddedV4(g6, g7); // NAT64
  if (g0 === 0x2002) return embeddedV4(g1, g2); // 6to4
  if ((g0 & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
  if ((g0 & 0xff00) === 0xff00) return false; // multicast
  if (g0 === 0x2001 && g1 === 0x0db8) return false; // documentation
  if (g0 === 0x2001 && g1 < 0x0200) return false; // 2001::/23 IETF special purpose (Teredo etc.)
  if (g0 === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return false; // discard-only 100::/64
  return true;
}

/** True only for globally routable unicast addresses. Invalid input is not public. */
export function isPublicIp(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isPublicIPv4(v4);
  const v6 = parseIPv6(ip);
  return v6 ? isPublicIPv6(v6) : false;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

const BLOCKED_HOST_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa", ".lan", ".corp"];

/** Checks the URL itself (before DNS). Throws UnsafeUrlError; returns the parsed URL. */
export function assertSafeUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError("Not a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new UnsafeUrlError("Only http and https URLs are allowed");
  if (url.username || url.password)
    throw new UnsafeUrlError("URLs with credentials are not allowed");
  if (url.port && url.port !== "80" && url.port !== "443")
    throw new UnsafeUrlError("Only standard ports are allowed");

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeUrlError("That host is not allowed");
  }
  const bare = host.replace(/^\[|\]$/g, "");
  if ((parseIPv4(bare) || parseIPv6(bare)) && !isPublicIp(bare)) {
    throw new UnsafeUrlError("That address is not allowed");
  }
  // Single-label names ("intranet") only resolve on private networks.
  if (!bare.includes(".") && !bare.includes(":"))
    throw new UnsafeUrlError("That host is not allowed");
  return url;
}

export type ResolveHost = (hostname: string) => Promise<string[]>;

export interface SafeFetchOptions {
  resolve: ResolveHost;
  fetch?: typeof fetch;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

export interface SafeFetchResult {
  finalUrl: string;
  contentType: string;
  bytes: Uint8Array;
}

async function assertPublicHost(url: URL, resolve: ResolveHost): Promise<void> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (parseIPv4(host) || parseIPv6(host)) return; // literal already checked
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new UnsafeUrlError("Could not resolve that host");
  }
  if (addresses.length === 0) throw new UnsafeUrlError("Could not resolve that host");
  if (!addresses.every(isPublicIp))
    throw new UnsafeUrlError("That host resolves to a private address");
}

/**
 * Fetches a user-supplied URL with SSRF protection, a timeout, a size cap, and
 * manual redirect handling. Residual risk: the HTTP client resolves the host again
 * when connecting, so a DNS-rebinding attacker with a very short TTL could race the
 * check; run edge functions without access to sensitive internal networks.
 */
export async function safeFetch(
  input: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const { resolve, maxBytes = 5 * 1024 * 1024, timeoutMs = 10_000, maxRedirects = 3 } = options;
  const doFetch = options.fetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    let url = assertSafeUrl(input);
    for (let hop = 0; ; hop++) {
      await assertPublicHost(url, resolve);
      const res = await doFetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "StudyPulseSyllabusFetcher/1.0",
          Accept: "text/html,text/plain,application/pdf;q=0.9,*/*;q=0.1",
        },
      });

      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel();
        const location = res.headers.get("location");
        if (!location || hop >= maxRedirects) throw new UnsafeUrlError("Too many redirects");
        url = assertSafeUrl(new URL(location, url));
        continue;
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new UnsafeUrlError(`The page returned HTTP ${String(res.status)}`);
      }

      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared > maxBytes) {
        await res.body?.cancel();
        throw new UnsafeUrlError("That page is too large");
      }
      const bytes = await readCapped(res, maxBytes);
      return {
        finalUrl: url.toString(),
        contentType: res.headers.get("content-type") ?? "",
        bytes,
      };
    }
  } catch (error) {
    if (controller.signal.aborted) throw new UnsafeUrlError("The page took too long to respond");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader: ReadableStreamDefaultReader<Uint8Array> = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new UnsafeUrlError("That page is too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
