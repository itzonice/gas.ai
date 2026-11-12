// Web Push sender (VAPID), used for web users with no Expo device.
// - Payload encryption: RFC 8291 (aes128gcm content coding, RFC 8188), one record.
// - Sender auth: RFC 8292 VAPID, an ES256 JWT for the push service's origin.
// Only WebCrypto is used, so this runs unchanged in edge functions (Deno) and Node.
import { z } from "zod";

export interface WebPushSubscription {
  /** Push service URL from PushSubscription.endpoint. */
  endpoint: string;
  /** Browser's P-256 public key, base64url (PushSubscription.getKey("p256dh")). */
  p256dh: string;
  /** 16-byte auth secret, base64url (PushSubscription.getKey("auth")). */
  auth: string;
}

export interface VapidKeys {
  /** Uncompressed P-256 public key (65 bytes), base64url. Also given to browsers. */
  publicKey: string;
  /** P-256 private scalar (32 bytes), base64url. Secret. */
  privateKey: string;
  /** Contact for push services: a mailto: or https: URL. */
  subject: string;
}

export interface WebPushOptions {
  vapid: VapidKeys;
  fetch?: typeof fetch;
  /** Seconds the push service keeps trying to deliver (default 1 day). */
  ttl?: number;
  urgency?: "very-low" | "low" | "normal" | "high";
  /** Hosts allowed as push endpoints (default: the major browser push services). */
  allowedHosts?: readonly string[];
  /** Clock for the JWT expiry (tests). */
  now?: () => Date;
}

export type WebPushResult =
  | { ok: true; status: number; messageId: string | null }
  /** `gone`: the subscription is dead (404/410) and should be invalidated. */
  | { ok: false; status: number; gone: boolean; message: string };

/**
 * Push services of Chrome/Edge (FCM), Firefox, Edge on Windows, and Safari. The server
 * POSTs to whatever endpoint a client registered, so anything else is refused (SSRF).
 */
export const WEB_PUSH_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "notify.windows.com",
  "push.apple.com",
] as const;

/** Push services accept at least 4096 bytes of encrypted payload. */
export const WEB_PUSH_MAX_PAYLOAD = 4096;
const RECORD_SIZE = 4096;
const JWT_LIFETIME_SECONDS = 12 * 60 * 60;

// ------------------------------------------------------------------ encoding

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*={0,2}$/.test(text)) throw new Error("invalid base64url");
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const utf8 = (text: string) => new TextEncoder().encode(text);

/** WebCrypto key types, derived so this compiles without the DOM lib. */
export type WebCryptoKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;
export interface WebCryptoKeyPair {
  publicKey: WebCryptoKey;
  privateKey: WebCryptoKey;
}

// ------------------------------------------------------------------ validation

/** Whether the server may POST to this endpoint: https on an allowed push host. */
export function isAllowedPushEndpoint(
  endpoint: string,
  allowedHosts: readonly string[] = WEB_PUSH_HOSTS,
): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
}

const p256Point = z.string().refine((v) => {
  try {
    const b = base64UrlDecode(v);
    return b.length === 65 && b[0] === 4;
  } catch {
    return false;
  }
}, "must be an uncompressed P-256 public key (base64url)");

export const webPushSubscriptionSchema = z.object({
  endpoint: z.url().refine((v) => v.startsWith("https://"), "must be https"),
  p256dh: p256Point,
  auth: z.string().refine((v) => {
    try {
      return base64UrlDecode(v).length === 16;
    } catch {
      return false;
    }
  }, "must be a 16-byte auth secret (base64url)"),
});

// ------------------------------------------------------------------ keys

/** Imports a VAPID key pair (raw base64url, as `generateVapidKeys` returns) for signing. */
async function importVapidPrivateKey(keys: VapidKeys): Promise<WebCryptoKey> {
  const pub = base64UrlDecode(keys.publicKey);
  const d = base64UrlDecode(keys.privateKey);
  if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) {
    throw new Error("VAPID keys must be a 65-byte public key and a 32-byte private key");
  }
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: base64UrlEncode(pub.slice(1, 33)),
      y: base64UrlEncode(pub.slice(33, 65)),
      d: base64UrlEncode(d),
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** A new VAPID key pair (base64url). Run once per environment; see scripts/gen-vapid-keys.ts. */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
  ]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  if (!jwk.d) throw new Error("could not export the private key");
  return { publicKey: base64UrlEncode(pub), privateKey: jwk.d };
}

// ------------------------------------------------------------------ VAPID (RFC 8292)

/** The Authorization header value for a push to `endpoint`. */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  now: Date = new Date(),
): Promise<string> {
  const header = base64UrlEncode(utf8(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    utf8(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now.getTime() / 1000) + JWT_LIFETIME_SECONDS,
        sub: keys.subject,
      }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  // WebCrypto ECDSA signatures are already r || s, the JWS (ES256) format.
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await importVapidPrivateKey(keys),
    utf8(signingInput),
  );
  return `vapid t=${signingInput}.${base64UrlEncode(new Uint8Array(signature))}, k=${keys.publicKey}`;
}

// ------------------------------------------------------------------ encryption (RFC 8291)

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Test hook: fixed sender key pair and salt, for the RFC 8291 test vector. */
export interface EncryptOverrides {
  senderKeys?: WebCryptoKeyPair;
  salt?: Uint8Array<ArrayBuffer>;
}

/** Encrypts `payload` for one subscription; returns the aes128gcm request body. */
export async function encryptWebPushPayload(
  subscription: Pick<WebPushSubscription, "p256dh" | "auth">,
  payload: Uint8Array<ArrayBuffer>,
  overrides: EncryptOverrides = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const uaPublic = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  const senderKeys =
    overrides.senderKeys ??
    (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]));
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeys.publicKey));
  const uaKey = await crypto.subtle.importKey(
    "raw",
    uaPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, senderKeys.privateKey, 256),
  );

  const ikm = await hkdf(
    authSecret,
    ecdhSecret,
    concat(utf8("WebPush: info\0"), uaPublic, asPublic),
    32,
  );
  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);

  // One record: payload + 0x02 (last-record delimiter), no padding.
  const record = concat(payload, new Uint8Array([2]));
  if (record.length + 16 > RECORD_SIZE) throw new Error("web push payload too large");
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, record),
  );

  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ciphertext);
}

// ------------------------------------------------------------------ sending

export interface WebPushMessage {
  title: string;
  body: string;
  /** Opened when the notification is clicked (path on the web app). */
  url?: string;
  /** Replaces an earlier notification with the same tag instead of stacking. */
  tag?: string;
  data?: Record<string, unknown>;
}

/**
 * The JSON the service worker receives. The body is trimmed so the encrypted payload
 * stays under what every push service accepts.
 */
export function webPushPayload(message: WebPushMessage): Uint8Array<ArrayBuffer> {
  let body = message.body;
  for (;;) {
    const bytes = utf8(JSON.stringify({ ...message, body }));
    // 86 bytes of header + 16-byte tag + 1 delimiter must fit alongside.
    if (bytes.length <= WEB_PUSH_MAX_PAYLOAD - 103 || body === "") return bytes;
    body = body.length > 40 ? `${body.slice(0, body.length - 40)}…` : "";
  }
}

/** Sends one notification. Never throws for push-service errors; see WebPushResult. */
export async function sendWebPush(
  subscription: WebPushSubscription,
  message: WebPushMessage,
  options: WebPushOptions,
): Promise<WebPushResult> {
  if (!isAllowedPushEndpoint(subscription.endpoint, options.allowedHosts)) {
    // Treated as dead so the subscription is invalidated and not retried.
    return { ok: false, status: 0, gone: true, message: "endpoint is not a known push service" };
  }
  const doFetch = options.fetch ?? fetch;
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await encryptWebPushPayload(subscription, webPushPayload(message));
  } catch (error) {
    // Malformed keys: this subscription can never work.
    return { ok: false, status: 0, gone: true, message: `encryption failed: ${String(error)}` };
  }
  let res: Response;
  try {
    res = await doFetch(subscription.endpoint, {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: await vapidAuthorization(
          subscription.endpoint,
          options.vapid,
          options.now?.(),
        ),
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: String(options.ttl ?? 24 * 60 * 60),
        Urgency: options.urgency ?? "high",
      },
      body,
    });
  } catch (error) {
    return { ok: false, status: 0, gone: false, message: `network error: ${String(error)}` };
  }
  if (res.status >= 200 && res.status < 300) {
    await res.body?.cancel();
    const location = res.headers.get("location");
    return { ok: true, status: res.status, messageId: location };
  }
  const text = (await res.text().catch(() => "")).slice(0, 300);
  return {
    ok: false,
    status: res.status,
    gone: res.status === 404 || res.status === 410,
    message: text || `push service returned ${String(res.status)}`,
  };
}
