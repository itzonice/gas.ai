import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AUTH_MESSAGES, authErrorMessage } from "./messages.ts";
import {
  isWeakPasswordError,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordProblem,
} from "./password.ts";

describe("password rules (S34)", () => {
  it("match the minimum Supabase Auth enforces", () => {
    const config = readFileSync(
      fileURLToPath(new URL("../../../../supabase/config.toml", import.meta.url)),
      "utf8",
    );
    const min = /^minimum_password_length = (\d+)$/m.exec(config)?.[1];
    expect(Number(min)).toBe(PASSWORD_MIN_LENGTH);
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(10);
    expect(AUTH_MESSAGES.weakPassword).toContain(`at least ${String(PASSWORD_MIN_LENGTH)}`);
  });

  it("checks length before submitting, counting bytes for the upper bound", () => {
    expect(passwordProblem("short-pw1")).toBe("Use at least 10 characters.");
    expect(passwordProblem("long-enough-1")).toBeNull();
    expect(passwordProblem("é".repeat(40))).toBe(
      `Use at most ${String(PASSWORD_MAX_LENGTH)} characters.`,
    );
  });

  it("tells the student when Supabase refuses the password, and nothing about accounts", () => {
    const weak = { status: 422, code: "weak_password", message: "Password is known to be weak" };
    expect(isWeakPasswordError(weak)).toBe(true);
    expect(authErrorMessage("sign-up", weak)).toBe(AUTH_MESSAGES.weakPassword);
    // Sign-in still says the same thing for every failure (S6).
    expect(authErrorMessage("sign-in", weak)).toBe(AUTH_MESSAGES.signInFailed);
    expect(authErrorMessage("sign-up", { status: 422, code: "user_already_exists" })).toBe(
      AUTH_MESSAGES.signUpSent,
    );
  });
});
