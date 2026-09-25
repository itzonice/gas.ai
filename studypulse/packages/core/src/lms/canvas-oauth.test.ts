import { describe, expect, it, vi } from "vitest";

import {
  canvasAuthorizeUrl,
  CanvasOAuthError,
  exchangeCanvasCode,
  needsRefresh,
  normalizeCanvasBaseUrl,
  refreshCanvasToken,
  revokeCanvasToken,
} from "./canvas-oauth.ts";

const client = {
  baseUrl: "https://canvas.school.edu",
  clientId: "10000000000001",
  clientSecret: "s3cret",
};
const now = new Date("2027-03-01T12:00:00Z");

describe("normalizeCanvasBaseUrl", () => {
  it("accepts https origins and normalizes them", () => {
    expect(normalizeCanvasBaseUrl("https://Canvas.School.edu/")).toBe("https://canvas.school.edu");
    expect(normalizeCanvasBaseUrl(" https://school.instructure.com ")).toBe(
      "https://school.instructure.com",
    );
  });

  it.each([
    "http://canvas.school.edu",
    "https://canvas.school.edu/courses",
    "https://canvas.school.edu:8443",
    "https://user:pw@canvas.school.edu",
    "https://10.0.0.5",
    "https://[::1]",
    "https://localhost",
    "not a url",
  ])("rejects %s", (url) => {
    expect(() => normalizeCanvasBaseUrl(url)).toThrow();
  });
});

describe("canvasAuthorizeUrl", () => {
  it("builds the authorize redirect with state and scopes", () => {
    const url = new URL(
      canvasAuthorizeUrl({
        client,
        redirectUri: "https://x.supabase.co/functions/v1/canvas-oauth/callback",
        state: "st4te",
        scopes: ["url:GET|/api/v1/courses"],
      }),
    );
    expect(url.origin + url.pathname).toBe("https://canvas.school.edu/login/oauth2/auth");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: "10000000000001",
      response_type: "code",
      redirect_uri: "https://x.supabase.co/functions/v1/canvas-oauth/callback",
      state: "st4te",
      scope: "url:GET|/api/v1/courses",
    });
  });
});

function tokenFetch(body: unknown, status = 200) {
  return vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(Response.json(body, { status })),
  );
}

describe("token requests", () => {
  it("exchanges a code for tokens", async () => {
    const fetchMock = tokenFetch({
      access_token: "at1",
      token_type: "Bearer",
      refresh_token: "rt1",
      expires_in: 3600,
      user: { id: 42, name: "Ada L" },
    });
    const tokens = await exchangeCanvasCode(
      client,
      { code: "c0de", redirectUri: "https://r.test/cb" },
      { fetch: fetchMock },
      now,
    );
    expect(tokens).toEqual({
      accessToken: "at1",
      refreshToken: "rt1",
      expiresAt: new Date("2027-03-01T13:00:00Z"),
      canvasUserId: "42",
      canvasUserName: "Ada L",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect((url as URL).href).toBe("https://canvas.school.edu/login/oauth2/token");
    expect(Object.fromEntries(new URLSearchParams(init!.body as string))).toEqual({
      client_id: "10000000000001",
      client_secret: "s3cret",
      grant_type: "authorization_code",
      code: "c0de",
      redirect_uri: "https://r.test/cb",
    });
    expect(init!.redirect).toBe("error");
  });

  it("refreshes (Canvas keeps the refresh token, so none comes back)", async () => {
    const fetchMock = tokenFetch({ access_token: "at2", expires_in: 3600 });
    const tokens = await refreshCanvasToken(client, "rt1", { fetch: fetchMock }, now);
    expect(tokens).toMatchObject({ accessToken: "at2", refreshToken: null });
    expect(new URLSearchParams(fetchMock.mock.calls[0]![1]!.body as string).get("grant_type")).toBe(
      "refresh_token",
    );
  });

  it("raises CanvasOAuthError with Canvas's error", async () => {
    const fetchMock = tokenFetch(
      { error: "invalid_grant", error_description: "refresh_token not found" },
      400,
    );
    const error = await refreshCanvasToken(client, "gone", { fetch: fetchMock }).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(CanvasOAuthError);
    expect(error).toMatchObject({ status: 400, code: "invalid_grant" });
  });

  it("revokes, treating an already-invalid token as done", async () => {
    const ok = vi.fn(() => Promise.resolve(new Response(null, { status: 200 })));
    expect(await revokeCanvasToken(client.baseUrl, "at1", { fetch: ok })).toBe(true);
    const gone = vi.fn(() => Promise.resolve(new Response(null, { status: 401 })));
    expect(await revokeCanvasToken(client.baseUrl, "at1", { fetch: gone })).toBe(true);
  });
});

describe("needsRefresh", () => {
  it("refreshes within 5 minutes of expiry", () => {
    expect(needsRefresh(new Date(now.getTime() + 4 * 60_000), now)).toBe(true);
    expect(needsRefresh(new Date(now.getTime() + 10 * 60_000), now)).toBe(false);
    expect(needsRefresh(null, now)).toBe(false);
  });
});
