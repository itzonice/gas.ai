// Launch safety S29: signed-out requests to app pages are redirected by the server before
// anything renders, and the session is verified with getUser (never trusted from cookies).
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const createServerClient = vi.fn(() => ({ auth: { getUser } }));
vi.mock("@supabase/ssr", () => ({ createServerClient }));

const { proxy } = await import("./proxy");

function request(path: string, cookie?: string) {
  return new NextRequest(`https://app.example.test${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  getUser.mockReset();
  createServerClient.mockClear();
});

describe("proxy (S29)", () => {
  it("redirects a signed-out visitor from an app page to sign-in, keeping the destination", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await proxy(request("/courses/abc?tab=grades"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://app.example.test/sign-in?next=%2Fcourses%2Fabc%3Ftab%3Dgrades",
    );
  });

  it("redirects when the cookie holds a token Supabase Auth rejects", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: Object.assign(new Error("invalid JWT"), { name: "AuthApiError", status: 403 }),
    });
    const res = await proxy(request("/today", "sb-project-auth-token=forged"));
    expect(res.status).toBe(307);
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it("lets a verified user through", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    const res = await proxy(request("/today"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("keeps public pages public", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    for (const path of ["/sign-in", "/privacy", "/terms", "/update-password"]) {
      expect((await proxy(request(path))).status, path).toBe(200);
    }
  });

  it("lets the page load when Supabase Auth is unreachable (RLS still guards data)", async () => {
    const { AuthRetryableFetchError } = await import("@supabase/supabase-js");
    getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    expect((await proxy(request("/today"))).status).toBe(200);
  });

  it("sets session cookies Secure on HTTPS and Lax", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });
    await proxy(request("/today"));
    const options = (createServerClient.mock.calls as unknown[][])[0]?.[2] as {
      cookieOptions: unknown;
    };
    expect(options.cookieOptions).toEqual({ path: "/", sameSite: "lax", secure: true });
  });
});
