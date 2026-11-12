import { describe, expect, it } from "vitest";

import { AUTH_MESSAGES, authErrorMessage } from "./index.ts";

describe("authErrorMessage", () => {
  it("never tells an unknown email apart from a wrong password", () => {
    const wrongPassword = authErrorMessage("sign-in", { status: 400, code: "invalid_credentials" });
    const unconfirmed = authErrorMessage("sign-in", { status: 400, code: "email_not_confirmed" });
    expect(wrongPassword).toBe(AUTH_MESSAGES.signInFailed);
    expect(unconfirmed).toBe(wrongPassword);
  });

  it("answers sign-up and reset the same whether or not the account exists", () => {
    expect(authErrorMessage("sign-up", null)).toBe(AUTH_MESSAGES.signUpSent);
    expect(authErrorMessage("sign-up", { status: 422, code: "user_already_exists" })).toBe(
      AUTH_MESSAGES.signUpSent,
    );
    expect(authErrorMessage("reset", null)).toBe(AUTH_MESSAGES.resetSent);
    expect(authErrorMessage("reset", { status: 400, code: "user_not_found" })).toBe(
      AUTH_MESSAGES.resetSent,
    );
  });

  it("says when to slow down, and when the service is unreachable", () => {
    expect(authErrorMessage("sign-in", { status: 429 })).toBe(AUTH_MESSAGES.rateLimited);
    expect(authErrorMessage("reset", { status: 400, code: "over_email_send_rate_limit" })).toBe(
      AUTH_MESSAGES.rateLimited,
    );
    expect(authErrorMessage("sign-up", { status: 0 })).toBe(AUTH_MESSAGES.unavailable);
    expect(authErrorMessage("sign-in", { status: 503 })).toBe(AUTH_MESSAGES.unavailable);
  });
});
