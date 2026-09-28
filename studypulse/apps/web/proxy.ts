// Runs on the server before every page (launch safety S29). Reads the session cookies,
// verifies them with Supabase Auth (getUser, not the unverified cookie contents), refreshes
// them when they're about to expire, and sends signed-out visitors to sign-in before any
// app page renders. Data access is still enforced by RLS; this decides what to render.
import type { Database } from "@studypulse/db";
import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { authCookieOptions, authRedirect } from "@/lib/auth-routes";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient<Database>(url, key, {
    cookieOptions: authCookieOptions(request.nextUrl.protocol === "https:"),
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookies, headers) {
        for (const { name, value } of cookies) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookies) response.cookies.set(name, value, options);
        for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  // Auth unreachable: let the page load; the client shows its own state and RLS still
  // guards every read. Signing everyone out during an Auth blip would be worse.
  if (!data.user && isAuthRetryableFetchError(error)) return response;

  const to = authRedirect(request.nextUrl.pathname, request.nextUrl.search, Boolean(data.user));
  if (!to) return response;
  const redirect = NextResponse.redirect(new URL(to, request.url));
  for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

export const config = {
  matcher: [
    // Pages only: not API routes, the Sentry tunnel, Next's assets, or files with an extension.
    "/((?!api/|monitoring|_next/static|_next/image|.*\\.[a-z0-9]+$).*)",
  ],
};
