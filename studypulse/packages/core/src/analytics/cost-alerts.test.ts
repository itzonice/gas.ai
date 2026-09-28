import { describe, expect, it } from "vitest";

import { dollars, formatCostAlert } from "./cost-alerts.ts";

describe("formatCostAlert", () => {
  it("describes per-user and total alerts", () => {
    expect(
      formatCostAlert({ user_id: "u-1", cost_cents: 612.5, threshold_cents: 100, uploads: 3 }),
    ).toBe("User u-1: $6.13 in the last 24 hours (3 uploads), over the $1.00 alert threshold");
    expect(
      formatCostAlert({ user_id: null, cost_cents: 5100, threshold_cents: 5000, uploads: 1 }),
    ).toBe(
      "Total AI spend: $51.00 in the last 24 hours (1 upload), over the $50.00 alert threshold",
    );
  });

  it("formats cents as dollars", () => {
    expect(dollars(0.4)).toBe("$0.00");
    expect(dollars(1999)).toBe("$19.99");
  });
});
