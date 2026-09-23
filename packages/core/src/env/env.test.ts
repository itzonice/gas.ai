import { describe, expect, it } from "vitest";

import { EnvError, edgeEnvSchema, mobileEnvSchema, parseEnv } from "./index.ts";

const validEdge = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
};

describe("parseEnv", () => {
  it("returns typed values and applies defaults", () => {
    const env = parseEnv("edge", edgeEnvSchema, validEdge);
    expect(env.APP_ENV).toBe("development");
    expect(env.SUPABASE_URL).toBe("http://127.0.0.1:54321");
  });

  it("treats empty optional values as unset", () => {
    const env = parseEnv("edge", edgeEnvSchema, { ...validEdge, SENTRY_DSN: "" });
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it("reports missing and malformed variables together", () => {
    const run = () =>
      parseEnv("mobile", mobileEnvSchema, { EXPO_PUBLIC_SUPABASE_URL: "not a url" });
    expect(run).toThrow(EnvError);
    try {
      run();
    } catch (error) {
      const { issues } = error as EnvError;
      expect(issues).toContain("EXPO_PUBLIC_SUPABASE_ANON_KEY: missing");
      expect(issues.some((i) => i.startsWith("EXPO_PUBLIC_SUPABASE_URL:"))).toBe(true);
    }
  });

  it("never echoes secret values in the error", () => {
    const secret = "sk-super-secret-value";
    try {
      parseEnv("edge", edgeEnvSchema, { ...validEdge, SUPABASE_URL: secret });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
  });
});
