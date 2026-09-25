import { describe, expect, it } from "vitest";

import { authCookieOptions, authRedirect, isPublicPath } from "./auth-routes";

describe("authRedirect (S29)", () => {
  it("sends signed-out visitors on app pages to sign-in, keeping where they were going", () => {
    expect(authRedirect("/today", "", false)).toBe("/sign-in?next=%2Ftoday");
    expect(authRedirect("/courses/abc", "?tab=grades", false)).toBe(
      "/sign-in?next=%2Fcourses%2Fabc%3Ftab%3Dgrades",
    );
    expect(authRedirect("/onboarding", "", false)).toBe("/sign-in?next=%2Fonboarding");
    expect(authRedirect("/", "", false)).toBe("/sign-in?next=%2F");
  });

  it("lets signed-in users through everywhere", () => {
    expect(authRedirect("/today", "", true)).toBeNull();
    expect(authRedirect("/settings", "", true)).toBeNull();
  });

  it("keeps sign-in, password reset, and the legal pages public", () => {
    for (const p of ["/sign-in", "/reset-password", "/update-password", "/privacy", "/terms"]) {
      expect(authRedirect(p, "", false), p).toBeNull();
    }
    expect(isPublicPath("/terms-and-more")).toBe(false);
    expect(isPublicPath("/sign-in/")).toBe(true);
  });

  it("sets Lax, first-party cookies, Secure on HTTPS", () => {
    expect(authCookieOptions(true)).toEqual({ path: "/", sameSite: "lax", secure: true });
    expect(authCookieOptions(false).secure).toBe(false);
  });
});
