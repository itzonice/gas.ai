// Google OAuth 2.0 for Calendar sync (web server flow with offline access). One app-wide
// client (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). Scopes are the narrowest that work:
// manage only calendars StudyPulse creates, and read free/busy (not event details).
// fetch-based with zod-checked responses; base URLs are overridable for tests.
import { z } from "zod";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/calendar.freebusy",
] as const;

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

export interface GoogleEndpoints {
  authUrl?: string;
  tokenUrl?: string;
  revokeUrl?: string;
  fetch?: typeof fetch;
}

export class GoogleOAuthError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(`Google OAuth ${String(status)}: ${message}`);
    this.name = "GoogleOAuthError";
    this.status = status;
    this.code = code;
  }

  /** The refresh token is no longer valid: the user must reconnect. */
  get needsReauth(): boolean {
    return this.code === "invalid_grant" || this.status === 401;
  }
}

/** Where to send the user to grant access. `prompt=consent` makes Google return a refresh token. */
export function googleAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  authUrl?: string;
}): string {
  const url = new URL(input.authUrl ?? GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", input.state);
  return url.toString();
}

const tokenSchema = z.looseObject({
  access_token: z.string().min(1),
  expires_in: z.number().positive().optional(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

const errorSchema = z.looseObject({
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export interface GoogleTokens {
  accessToken: string;
  /** Only on the first exchange (and when Google rotates it). */
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
}

async function tokenRequest(
  client: GoogleClient,
  params: Record<string, string>,
  endpoints: GoogleEndpoints,
  now: Date,
): Promise<GoogleTokens> {
  const res = await (endpoints.fetch ?? fetch)(endpoints.tokenUrl ?? GOOGLE_TOKEN_URL, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      ...params,
    }).toString(),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = errorSchema.safeParse(json);
    const body = e.success ? e.data : {};
    throw new GoogleOAuthError(
      res.status,
      body.error_description ?? body.error ?? res.statusText,
      body.error,
    );
  }
  const parsed = tokenSchema.safeParse(json);
  if (!parsed.success) throw new GoogleOAuthError(res.status, "unexpected token response");
  const t = parsed.data;
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: t.expires_in ? new Date(now.getTime() + t.expires_in * 1000) : null,
    scopes: t.scope ? t.scope.split(" ") : [],
  };
}

export function exchangeGoogleCode(
  client: GoogleClient,
  input: { code: string; redirectUri: string },
  endpoints: GoogleEndpoints = {},
  now = new Date(),
): Promise<GoogleTokens> {
  return tokenRequest(
    client,
    { grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri },
    endpoints,
    now,
  );
}

export function refreshGoogleToken(
  client: GoogleClient,
  refreshToken: string,
  endpoints: GoogleEndpoints = {},
  now = new Date(),
): Promise<GoogleTokens> {
  return tokenRequest(
    client,
    { grant_type: "refresh_token", refresh_token: refreshToken },
    endpoints,
    now,
  );
}

/** Revokes a token (and its grant). True if Google accepted it or it was already invalid. */
export async function revokeGoogleToken(
  token: string,
  endpoints: GoogleEndpoints = {},
): Promise<boolean> {
  const res = await (endpoints.fetch ?? fetch)(endpoints.revokeUrl ?? GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
  });
  return res.ok || res.status === 400;
}

/** Refresh a little early so a sync never starts with an about-to-expire token. */
export function googleTokenNeedsRefresh(expiresAt: Date | null, now = new Date()): boolean {
  return expiresAt === null || expiresAt.getTime() - now.getTime() < 5 * 60_000;
}

/** Whether the user granted everything the sync needs (they can untick scopes). */
export function hasRequiredScopes(granted: readonly string[]): boolean {
  return GOOGLE_SCOPES.every((s) => granted.includes(s));
}
