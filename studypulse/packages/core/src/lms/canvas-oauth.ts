// Canvas LMS OAuth2 (https://canvas.instructure.com/doc/api/file.oauth.html).
// Each school runs its own Canvas at its own URL and issues its own developer key
// (client id + secret), so everything here takes the institution's base URL.
// fetch-based with zod-checked responses; runs in edge functions and Node tests.
import { z } from "zod";

/**
 * Scopes for the sync (courses, assignments, submissions for grades). Only enforced
 * when the school's developer key has "Enforce scopes" on; harmless otherwise.
 */
export const CANVAS_SCOPES = [
  "url:GET|/api/v1/users/:user_id/profile",
  "url:GET|/api/v1/courses",
  "url:GET|/api/v1/courses/:course_id/assignments",
  "url:GET|/api/v1/courses/:course_id/assignment_groups",
  "url:GET|/api/v1/courses/:course_id/students/submissions",
] as const;

export interface CanvasClient {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

export interface CanvasOAuthOptions {
  fetch?: typeof fetch;
}

export class CanvasOAuthError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(status: number, message: string, code?: string) {
    super(`Canvas OAuth ${String(status)}: ${message}`);
    this.name = "CanvasOAuthError";
    this.status = status;
    this.code = code;
  }
}

/**
 * A school's Canvas origin, normalized ("https://canvas.school.edu"). Only https and a
 * bare origin: the server sends client secrets and tokens here, so no paths, ports,
 * credentials, or IP addresses.
 */
export function normalizeCanvasBaseUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Canvas URL must be a valid URL");
  }
  if (url.protocol !== "https:") throw new Error("Canvas URL must use https");
  if (url.username || url.password || url.port)
    throw new Error("Canvas URL must be a plain origin");
  if (url.pathname !== "/" || url.search || url.hash)
    throw new Error("Canvas URL must not have a path");
  const host = url.hostname.toLowerCase();
  if (/^[\d.]+$/.test(host) || host.includes(":") || !host.includes(".")) {
    throw new Error("Canvas URL must use a public host name");
  }
  return `https://${host}`;
}

/** Where to send the user to approve access. */
export function canvasAuthorizeUrl(input: {
  client: Pick<CanvasClient, "baseUrl" | "clientId">;
  redirectUri: string;
  state: string;
  scopes?: readonly string[];
}): string {
  const url = new URL("/login/oauth2/auth", input.client.baseUrl);
  url.searchParams.set("client_id", input.client.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", input.state);
  url.searchParams.set("scope", (input.scopes ?? CANVAS_SCOPES).join(" "));
  return url.toString();
}

const tokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  // Present on the code exchange; refresh responses keep the existing refresh token.
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().positive().optional(),
  user: z
    .looseObject({ id: z.union([z.number(), z.string()]), name: z.string().optional() })
    .optional(),
});

export interface CanvasTokens {
  accessToken: string;
  refreshToken: string | null;
  /** When the access token expires (Canvas tokens last about an hour). */
  expiresAt: Date | null;
  canvasUserId: string | null;
  canvasUserName: string | null;
}

const errorSchema = z.looseObject({
  error: z.string().optional(),
  error_description: z.string().optional(),
});

async function tokenRequest(
  client: CanvasClient,
  params: Record<string, string>,
  options: CanvasOAuthOptions,
  now: Date,
): Promise<CanvasTokens> {
  const res = await (options.fetch ?? fetch)(new URL("/login/oauth2/token", client.baseUrl), {
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
    const err = errorSchema.safeParse(json);
    const e = err.success ? err.data : {};
    throw new CanvasOAuthError(
      res.status,
      e.error_description ?? e.error ?? res.statusText,
      e.error,
    );
  }
  const parsed = tokenResponseSchema.safeParse(json);
  if (!parsed.success) throw new CanvasOAuthError(res.status, "unexpected token response");
  const t = parsed.data;
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    expiresAt: t.expires_in ? new Date(now.getTime() + t.expires_in * 1000) : null,
    canvasUserId: t.user ? String(t.user.id) : null,
    canvasUserName: t.user?.name ?? null,
  };
}

/** Exchanges the code from the callback for tokens. */
export function exchangeCanvasCode(
  client: CanvasClient,
  input: { code: string; redirectUri: string },
  options: CanvasOAuthOptions = {},
  now: Date = new Date(),
): Promise<CanvasTokens> {
  return tokenRequest(
    client,
    { grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri },
    options,
    now,
  );
}

/** A new access token from the refresh token (which Canvas keeps the same). */
export function refreshCanvasToken(
  client: CanvasClient,
  refreshToken: string,
  options: CanvasOAuthOptions = {},
  now: Date = new Date(),
): Promise<CanvasTokens> {
  return tokenRequest(
    client,
    { grant_type: "refresh_token", refresh_token: refreshToken },
    options,
    now,
  );
}

/** Revokes the access token (and with it the refresh token) at Canvas. Best effort. */
export async function revokeCanvasToken(
  baseUrl: string,
  accessToken: string,
  options: CanvasOAuthOptions = {},
): Promise<boolean> {
  const res = await (options.fetch ?? fetch)(new URL("/login/oauth2/token", baseUrl), {
    method: "DELETE",
    redirect: "error",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  await res.body?.cancel();
  return res.ok || res.status === 401; // 401: already invalid
}

/** Refresh when the access token has less than this left. */
export const CANVAS_REFRESH_MARGIN_MS = 5 * 60 * 1000;

export const needsRefresh = (expiresAt: Date | null, now: Date = new Date()) =>
  expiresAt !== null && expiresAt.getTime() - now.getTime() < CANVAS_REFRESH_MARGIN_MS;
