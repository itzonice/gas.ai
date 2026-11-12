import { describe, expect, it } from "vitest";

import { featureFlags, FEATURES, featureStatus } from "./features.ts";

describe("featureStatus", () => {
  it("turns everything off with an empty environment, without throwing", () => {
    const status = featureStatus({});
    for (const [name, s] of Object.entries(status)) {
      expect(s.enabled, name).toBe(false);
      expect(s.missing, name).toEqual(FEATURES[name as keyof typeof FEATURES].requires);
    }
  });

  it("needs every variable of a feature, and treats blank values as missing", () => {
    expect(featureStatus({ VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "k" }).webPush).toEqual({
      enabled: false,
      missing: ["VAPID_SUBJECT"],
    });
    expect(
      featureStatus({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "   " }).googleCalendar.enabled,
    ).toBe(false);
    expect(
      featureStatus({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" }).googleCalendar.enabled,
    ).toBe(true);
  });

  it("reports flags without variable names", () => {
    expect(featureFlags({ ANTHROPIC_API_KEY: "x" }, ["ai", "stripe"])).toEqual({
      ai: true,
      stripe: false,
    });
  });
});
