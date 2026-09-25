// Which pages need a signed-in user, and how the session cookies are set (launch safety
// S29). Used by proxy.ts on the server and by the browser client, so both agree.
import type { CookieOptionsWithName } from "@supabase/ssr";

/** Pages anyone can open. Everything else needs a verified session. */
export const PUBLIC_PATHS = [
  "/sign-in",
  "/reset-password",
  // Opened from the reset email; the browser exchanges the link's code for a session.
  "/update-password",
  "/privacy",
  "/terms",
  "/refunds",
  "/cookies",
  "/copyright",
  "/eula",
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Where to send a request, or null to let it through. Signed-out visitors to an app page
 * go to sign-in and come back afterwards.
 */
export function authRedirect(pathname: string, search: string, signedIn: boolean): string | null {
  if (signedIn || isPublicPath(pathname)) return null;
  return `/sign-in?next=${encodeURIComponent(pathname + search)}`;
}

/**
 * Session cookies: first-party, Lax (not sent on cross-site POSTs), and Secure on HTTPS.
 * Not httpOnly: the browser client reads them to call the API directly; the server never
 * trusts them without asking Supabase Auth (getUser) first.
 */
export function authCookieOptions(https: boolean): CookieOptionsWithName {
  return { path: "/", sameSite: "lax", secure: https };
}
