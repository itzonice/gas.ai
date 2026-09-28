// Signed unsubscribe tokens for email links: "<user id>.<HMAC-SHA256(user id)>".
// Stateless, so every email can carry a working link without storing anything; rotating
// the secret invalidates old links (they then show "link expired", nothing else leaks).
import { base64UrlDecode, base64UrlEncode } from "./webpush.ts";

/**
 * What a link unsubscribes from. Each scope signs differently, so a digest link can't be
 * replayed to change marketing preferences or the other way round (launch safety S15).
 */
export type UnsubscribeScope = "digest" | "marketing";
const PURPOSES: Record<UnsubscribeScope, string> = {
  digest: "email-unsubscribe:v1:", // unchanged, so links already sent keep working
  marketing: "email-unsubscribe:marketing:v1:",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function hmacKey(secret: string) {
  if (secret.length < 32) throw new Error("the unsubscribe secret must be at least 32 characters");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signUnsubscribeToken(
  userId: string,
  secret: string,
  scope: UnsubscribeScope = "digest",
): Promise<string> {
  if (!UUID_RE.test(userId)) throw new Error("user id must be a UUID");
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(PURPOSES[scope] + userId.toLowerCase()),
  );
  return `${userId.toLowerCase()}.${base64UrlEncode(new Uint8Array(signature))}`;
}

/** The user id the token was issued for, or null if it is malformed or forged. */
export async function verifyUnsubscribeToken(
  token: string,
  secret: string,
  scope: UnsubscribeScope = "digest",
): Promise<string | null> {
  const [userId, signature, extra] = token.split(".");
  if (!userId || !signature || extra !== undefined || !UUID_RE.test(userId)) return null;
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64UrlDecode(signature);
  } catch {
    return null;
  }
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    bytes,
    new TextEncoder().encode(PURPOSES[scope] + userId.toLowerCase()),
  );
  return valid ? userId.toLowerCase() : null;
}
