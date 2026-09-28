import { describe, expect, it, vi } from "vitest";

import {
  base64UrlDecode,
  base64UrlEncode,
  encryptWebPushPayload,
  generateVapidKeys,
  isAllowedPushEndpoint,
  sendWebPush,
  vapidAuthorization,
  WEB_PUSH_MAX_PAYLOAD,
  webPushPayload,
  webPushSubscriptionSchema,
  type WebCryptoKeyPair,
} from "./webpush.ts";

// RFC 8291, Appendix A.
const rfc = {
  asPublic:
    "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic:
    "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  uaPrivate: "q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  plaintext: "When I grow up, I want to be a watermelon",
  body: "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

function ecJwk(publicKey: string, privateKey: string) {
  const pub = base64UrlDecode(publicKey);
  return {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncode(pub.slice(1, 33)),
    y: base64UrlEncode(pub.slice(33)),
    d: privateKey,
    ext: true,
  };
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: string, length: number) {
  const key = await crypto.subtle.importKey("raw", new Uint8Array(ikm), "HKDF", false, [
    "deriveBits",
  ]);
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(salt), info: utf8(info) },
      key,
      length * 8,
    ),
  );
}
const utf8 = (s: string) => new TextEncoder().encode(s);

/** What the browser does: decrypts an aes128gcm body with its private key. */
async function decrypt(body: Uint8Array, uaPublic: string, uaPrivate: string, auth: string) {
  const salt = body.slice(0, 16);
  const idLen = body[20]!;
  const asPublic = body.slice(21, 21 + idLen);
  const ua = await crypto.subtle.importKey(
    "jwk",
    ecJwk(uaPublic, uaPrivate),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveBits"],
  );
  const as = await crypto.subtle.importKey(
    "raw",
    asPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const secret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: as }, ua, 256),
  );
  const info = new Uint8Array([
    ...utf8("WebPush: info\0"),
    ...base64UrlDecode(uaPublic),
    ...asPublic,
  ]);
  const key = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits"]);
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: base64UrlDecode(auth), info },
      key,
      256,
    ),
  );
  const cek = await hkdf(salt, ikm, "Content-Encoding: aes128gcm\0", 16);
  const nonce = await hkdf(salt, ikm, "Content-Encoding: nonce\0", 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, aes, body.slice(21 + idLen)),
  );
  expect(plain.at(-1)).toBe(2); // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1));
}

async function rfcSenderKeys(): Promise<WebCryptoKeyPair> {
  return {
    privateKey: await crypto.subtle.importKey(
      "jwk",
      ecJwk(rfc.asPublic, rfc.asPrivate),
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveBits"],
    ),
    publicKey: await crypto.subtle.importKey(
      "raw",
      base64UrlDecode(rfc.asPublic),
      { name: "ECDH", namedCurve: "P-256" },
      true,
      [],
    ),
  };
}

const sub = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  p256dh: rfc.uaPublic,
  auth: rfc.auth,
};

describe("encryptWebPushPayload", () => {
  it("matches the RFC 8291 test vector", async () => {
    const body = await encryptWebPushPayload(sub, utf8(rfc.plaintext), {
      senderKeys: await rfcSenderKeys(),
      salt: base64UrlDecode(rfc.salt),
    });
    expect(base64UrlEncode(body)).toBe(rfc.body);
  });

  it("uses a fresh key and salt each time, and the browser can decrypt it", async () => {
    const a = await encryptWebPushPayload(sub, utf8("hello"));
    const b = await encryptWebPushPayload(sub, utf8("hello"));
    expect(base64UrlEncode(a)).not.toBe(base64UrlEncode(b));
    expect(await decrypt(a, rfc.uaPublic, rfc.uaPrivate, rfc.auth)).toBe("hello");
  });
});

describe("vapidAuthorization", () => {
  it("signs an ES256 JWT for the push service origin", async () => {
    const keys = { ...(await generateVapidKeys()), subject: "mailto:ops@studypulse.app" };
    const now = new Date("2027-03-01T12:00:00Z");
    const header = await vapidAuthorization(sub.endpoint, keys, now);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, h, c, s, k] = match!;
    expect(k).toBe(keys.publicKey);
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(h!)))).toEqual({
      typ: "JWT",
      alg: "ES256",
    });
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(c!)))).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: now.getTime() / 1000 + 12 * 3600,
      sub: "mailto:ops@studypulse.app",
    });
    const verifyKey = await crypto.subtle.importKey(
      "raw",
      base64UrlDecode(keys.publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verifyKey,
      base64UrlDecode(s!),
      utf8(`${h!}.${c!}`),
    );
    expect(valid).toBe(true);
  });

  it("rejects malformed keys", async () => {
    await expect(
      vapidAuthorization(sub.endpoint, { publicKey: "AAAA", privateKey: "AAAA", subject: "x" }),
    ).rejects.toThrow(/VAPID keys/);
  });
});

describe("isAllowedPushEndpoint", () => {
  it.each([
    ["https://fcm.googleapis.com/fcm/send/x", true],
    ["https://updates.push.services.mozilla.com/wpush/v2/x", true],
    ["https://web.push.apple.com/QG9", true],
    ["https://db5p.notify.windows.com/w/?token=x", true],
    ["http://fcm.googleapis.com/fcm/send/x", false],
    ["https://fcm.googleapis.com:8443/x", false],
    ["https://evil-fcm.googleapis.com.attacker.io/x", false],
    ["https://notfcm.googleapis.com.evil/x", false],
    ["https://169.254.169.254/latest/meta-data", false],
    ["https://user:pw@fcm.googleapis.com/x", false],
    ["not a url", false],
  ])("%s -> %s", (endpoint, allowed) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(allowed);
  });
});

describe("webPushSubscriptionSchema", () => {
  it("accepts a browser subscription and rejects bad keys", () => {
    expect(webPushSubscriptionSchema.safeParse(sub).success).toBe(true);
    expect(webPushSubscriptionSchema.safeParse({ ...sub, auth: "AAAA" }).success).toBe(false);
    expect(webPushSubscriptionSchema.safeParse({ ...sub, p256dh: rfc.auth }).success).toBe(false);
    expect(webPushSubscriptionSchema.safeParse({ ...sub, endpoint: "http://x.test" }).success).toBe(
      false,
    );
  });
});

describe("webPushPayload", () => {
  it("keeps the encrypted payload within the size every push service accepts", () => {
    const bytes = webPushPayload({ title: "t", body: "é".repeat(5000) });
    expect(bytes.length + 103).toBeLessThanOrEqual(WEB_PUSH_MAX_PAYLOAD);
    expect(JSON.parse(new TextDecoder().decode(bytes))).toMatchObject({ title: "t" });
  });
});

describe("sendWebPush", () => {
  const vapid = async () => ({ ...(await generateVapidKeys()), subject: "mailto:a@b.test" });

  it("POSTs an encrypted, VAPID-signed message", async () => {
    const fetchMock = vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        new Response(null, {
          status: 201,
          headers: { location: "https://fcm.googleapis.com/m/1" },
        }),
      ),
    );
    const result = await sendWebPush(
      sub,
      { title: "Lab 3 is due today at 5:00 PM", body: "BIO 201", url: "/today" },
      { vapid: await vapid(), fetch: fetchMock },
    );
    expect(result).toEqual({ ok: true, status: 201, messageId: "https://fcm.googleapis.com/m/1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(sub.endpoint);
    const headers = init!.headers as Record<string, string>;
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.TTL).toBe("86400");
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=/);
    const text = await decrypt(init!.body as Uint8Array, rfc.uaPublic, rfc.uaPrivate, rfc.auth);
    expect(JSON.parse(text)).toEqual({
      title: "Lab 3 is due today at 5:00 PM",
      body: "BIO 201",
      url: "/today",
    });
  });

  it("reports dead subscriptions (404/410) and transient failures", async () => {
    const respond = (status: number) => () => Promise.resolve(new Response("nope", { status }));
    const keys = await vapid();
    expect(
      await sendWebPush(sub, { title: "t", body: "b" }, { vapid: keys, fetch: respond(410) }),
    ).toMatchObject({ ok: false, status: 410, gone: true });
    expect(
      await sendWebPush(sub, { title: "t", body: "b" }, { vapid: keys, fetch: respond(404) }),
    ).toMatchObject({ ok: false, gone: true });
    expect(
      await sendWebPush(sub, { title: "t", body: "b" }, { vapid: keys, fetch: respond(429) }),
    ).toMatchObject({ ok: false, status: 429, gone: false });
    const offline = () => Promise.reject(new TypeError("fetch failed"));
    expect(
      await sendWebPush(sub, { title: "t", body: "b" }, { vapid: keys, fetch: offline }),
    ).toMatchObject({ ok: false, status: 0, gone: false });
  });

  it("never calls endpoints outside the push services", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 201 })));
    const result = await sendWebPush(
      { ...sub, endpoint: "https://internal.service.local/admin" },
      { title: "t", body: "b" },
      { vapid: await vapid(), fetch: fetchMock },
    );
    expect(result).toMatchObject({ ok: false, gone: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
