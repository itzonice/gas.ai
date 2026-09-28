import { describe, expect, it } from "vitest";

import { buildDisputeEvidence, disputeRate, formatDisputeAlert } from "./disputes.ts";
import { stripeEventAction } from "./stripe-webhook.ts";

const event = (type: string, object: Record<string, unknown>) => ({
  id: "evt_1",
  type,
  created: 1_790_000_000,
  data: { object },
});

describe("dispute events", () => {
  it("maps a new dispute and an actionable early fraud warning", () => {
    const d = stripeEventAction(
      event("charge.dispute.created", {
        id: "dp_1",
        object: "dispute",
        charge: "ch_1",
        amount: 3999,
        currency: "usd",
        reason: "fraudulent",
        status: "warning_needs_response",
        evidence_details: { due_by: 1_791_000_000 },
      }),
    );
    expect(d.kind).toBe("dispute");
    const w = stripeEventAction(
      event("radar.early_fraud_warning.created", {
        id: "issfr_1",
        object: "radar.early_fraud_warning",
        actionable: true,
        charge: "ch_2",
      }),
    );
    expect(w.kind).toBe("fraud_warning");
    const done = stripeEventAction(
      event("radar.early_fraud_warning.created", {
        id: "issfr_2",
        object: "radar.early_fraud_warning",
        actionable: false,
        charge: "ch_3",
      }),
    );
    expect(done.kind).toBe("ignore");
  });
});

describe("dispute evidence", () => {
  it("includes the Terms acceptances, usage, sign-ins, and the policies", () => {
    const evidence = buildDisputeEvidence({
      email: "sam@example.edu",
      name: "Sam",
      termsAcceptances: [
        { version: "2026-09-25", context: "signup", accepted_at: "2026-09-26T10:00:00Z" },
        { version: "2026-09-25", context: "checkout", accepted_at: "2026-09-27T10:00:00Z" },
      ],
      signIns: [{ at: "2026-10-02T08:00:00Z", user_agent: "Safari" }],
      usage: {
        courses: 4,
        uploads: 5,
        study_sessions: 31,
        study_minutes: 1240,
        first_active_at: "2026-09-26T10:05:00Z",
        last_active_at: "2026-10-20T21:00:00Z",
      },
      appUrl: "https://app.example",
      chargeCreated: 1_790_000_000,
    });
    expect(evidence.customer_email_address).toBe("sam@example.edu");
    expect(evidence.uncategorized_text).toContain("Accepted Terms version 2026-09-25 at checkout");
    expect(evidence.access_activity_log).toContain("31 study sessions (1240 minutes)");
    expect(evidence.access_activity_log).toContain("2026-10-02T08:00:00Z (Safari)");
    expect(evidence.cancellation_policy_disclosure).toContain(
      "Renews automatically until you cancel",
    );
    expect(evidence.refund_policy_disclosure).toContain("https://app.example/refunds");
    expect(evidence.service_date).toBe("2026-09-21");
  });
});

describe("dispute rate", () => {
  it("alerts above 0.5% of charges in the window", () => {
    expect(disputeRate(1, 200).overThreshold).toBe(false);
    expect(disputeRate(2, 200).overThreshold).toBe(true); // 1%: the example from the plan
    expect(disputeRate(1, 0).overThreshold).toBe(true);
    expect(disputeRate(0, 0).overThreshold).toBe(false);
    const text = formatDisputeAlert({
      disputeId: "dp_1",
      amountCents: 3999,
      currency: "usd",
      reason: "fraudulent",
      dueBy: null,
      userId: null,
      rate: disputeRate(2, 200),
    });
    expect(text).toContain("$39.99");
    expect(text).toContain("2/200 = 1.00%");
    expect(text).toContain("ABOVE 0.5%");
  });
});
