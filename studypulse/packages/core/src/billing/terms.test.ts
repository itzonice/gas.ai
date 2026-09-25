import { describe, expect, it } from "vitest";

import { billingEmailFromEvent } from "./emails.ts";
import { CANCEL_INSTRUCTIONS, formatPrice, subscriptionTerms } from "./terms.ts";

const invoice = (type: string, over: Record<string, unknown>, interval = "year") => ({
  id: "evt_1",
  type,
  created: 1_790_000_000,
  data: {
    object: {
      object: "invoice",
      customer_email: "sam@example.edu",
      currency: "usd",
      lines: { data: [{ period: { end: 1_821_536_000 }, price: { recurring: { interval } } }] },
      ...over,
    },
  },
});

describe("subscription terms (S16)", () => {
  it("say the price, how often, that it renews until canceled, and how to cancel", () => {
    const t = subscriptionTerms("yearly", { amount_cents: 3999, currency: "usd" });
    expect(t).toEqual({
      price: "$39.99 / year",
      frequency: "Billed once a year",
      renewal: "Renews automatically every year until you cancel.",
      cancel: CANCEL_INSTRUCTIONS,
    });
    expect(subscriptionTerms("monthly", null).price).toBeNull();
    expect(formatPrice({ amount_cents: 499, currency: "eur" })).toBe("€4.99");
  });
});

describe("billing emails", () => {
  it("confirms a new subscription with the same terms", () => {
    const email = billingEmailFromEvent(
      invoice("invoice.paid", { billing_reason: "subscription_create", amount_paid: 3999 }),
      { appUrl: "https://app.example", supportEmail: "help@example.com" },
    )!;
    expect(email.kind).toBe("subscription_confirmation");
    expect(email.to).toBe("sam@example.edu");
    for (const part of [
      "$39.99 / year",
      "Renews automatically every year until you cancel.",
      "Settings → Manage subscription",
      "https://app.example/settings#plan",
      "help@example.com",
    ]) {
      expect(email.text).toContain(part);
    }
    expect(email.html).toContain("Renews automatically every year until you cancel.");
  });

  it("reminds before a yearly renewal, not a monthly one", () => {
    const yearly = billingEmailFromEvent(invoice("invoice.upcoming", { amount_due: 3999 }))!;
    expect(yearly.kind).toBe("renewal_reminder");
    expect(yearly.text).toContain("$39.99");
    expect(yearly.text).toContain("Cancel anytime");
    expect(
      billingEmailFromEvent(invoice("invoice.upcoming", { amount_due: 499 }, "month")),
    ).toBeNull();
  });

  it("ignores renewals' paid invoices and unrelated events", () => {
    expect(
      billingEmailFromEvent(invoice("invoice.paid", { billing_reason: "subscription_cycle" })),
    ).toBeNull();
    expect(billingEmailFromEvent(invoice("customer.created", {}))).toBeNull();
  });
});
