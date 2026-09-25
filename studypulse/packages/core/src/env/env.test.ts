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

  it("checks PARSER_MODEL and CARDS_MODEL look like Claude model ids", () => {
    expect(
      parseEnv("edge", edgeEnvSchema, { ...validEdge, PARSER_MODEL: "claude-sonnet-5" })
        .PARSER_MODEL,
    ).toBe("claude-sonnet-5");
    expect(
      parseEnv("edge", edgeEnvSchema, { ...validEdge, CARDS_MODEL: "claude-haiku-4-5-20251001" })
        .CARDS_MODEL,
    ).toBe("claude-haiku-4-5-20251001");
    expect(() => parseEnv("edge", edgeEnvSchema, { ...validEdge, PARSER_MODEL: "gpt-5" })).toThrow(
      'PARSER_MODEL: must be a Claude model id, e.g. "claude-opus-5"',
    );
    expect(() =>
      parseEnv("edge", edgeEnvSchema, { ...validEdge, PARSER_MODEL: "Claude Opus 5" }),
    ).toThrow(/PARSER_MODEL/);
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
