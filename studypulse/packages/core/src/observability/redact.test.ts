import { describe, expect, it } from "vitest";

import { redactText } from "./redact.ts";

// Fake credentials are assembled at runtime so the gitleaks pre-commit hook and CI job
// don't flag this file. None of them are real.
const fake = {
  jwt: ["eyJhbGciOiJIUzI1NiJ9", "eyJyb2xlIjoic2VydmljZV9yb2xlIn0", "c2lnbmF0dXJlLWZha2U"].join("."),
  stripe: "sk_" + "live_" + "4eC39HqLyjWDarjtT1zdp7dc",
  stripeRestricted: "rk_" + "test_" + "51Hxyzabcdefghijklmnop",
  webhook: "whsec_" + "abcdefghijklmnop123456",
  anthropic: "sk-" + "ant-" + "api03-abcdefghijklmnopqrstuvwxyz",
  resend: "re_" + "123456789_abcdefghijklmnop",
  opaque: "a1b2c3d4e5".repeat(5),
};

describe("redactText", () => {
  it.each([
    ["a JWT", `token was ${fake.jwt} here`, "token was [redacted] here"],
    ["a Bearer value", "Authorization: Bearer abc.def-123", "Authorization: Bearer [redacted]"],
    ["a Stripe secret key", `key=${fake.stripe}`, "key=[redacted]"],
    ["a Stripe restricted key", `using ${fake.stripeRestricted}`, "using [redacted]"],
    ["a Stripe webhook secret", `secret ${fake.webhook}`, "secret [redacted]"],
    ["an Anthropic key", `x-api-key ${fake.anthropic}`, "x-api-key [redacted]"],
    ["a Resend key", `resend ${fake.resend} failed`, "resend [redacted] failed"],
    ["an email address", "sent to ada.lovelace+test@example.co.uk", "sent to [email]"],
    ["an opaque token", `feed ${fake.opaque}`, "feed [redacted]"],
  ])("redacts %s", (_name, input, expected) => {
    expect(redactText(input)).toBe(expected);
  });

  it("redacts tokens and OAuth values in query strings", () => {
    expect(
      redactText("GET /calendar-feed?token=abc123&tz=UTC and /callback?code=4/0Ab&state=xyz#top"),
    ).toBe(
      "GET /calendar-feed?token=[redacted]&tz=UTC and /callback?code=[redacted]&state=[redacted]#top",
    );
  });

  it("redacts credentials in URLs before they read as an email address", () => {
    expect(redactText("postgres://postgres:hunter2@db.example.com:5432/app")).toBe(
      "postgres://[redacted]@db.example.com:5432/app",
    );
  });

  it("keeps ordinary text, UUIDs, and long words readable", () => {
    const text =
      "course 3f2b8c1e-9a4d-4e6b-8c2d-1a2b3c4d5e6f parsed in 120ms; " +
      "pneumonoultramicroscopicsilicovolcanoconiosis_and_more";
    expect(redactText(text)).toBe(text);
  });
});
