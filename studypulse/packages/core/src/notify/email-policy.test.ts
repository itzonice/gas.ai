import { describe, expect, it } from "vitest";

import {
  EMAIL_KINDS,
  MarketingEmailError,
  planMarketingEmail,
  type MarketingEmailInput,
} from "./email-policy.ts";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe.ts";

const base: MarketingEmailInput = {
  kind: "product_news",
  optedIn: true,
  subject: "New: exam countdowns",
  html: "<html><body><p>Hi</p></body></html>",
  text: "Hi",
  unsubscribeUrl: "https://api.example/functions/v1/email-unsubscribe?scope=marketing&token=t",
  postalAddress: "PO Box 123, Springfield, IL 62701, USA",
  companyName: "StudyPulse LLC",
};

describe("marketing email policy", () => {
  it("every marketing email has the postal address and a one-click unsubscribe", () => {
    const email = planMarketingEmail(base)!;
    expect(email.html).toContain("PO Box 123, Springfield, IL 62701, USA");
    expect(email.text).toContain("PO Box 123");
    expect(email.html).toContain(base.unsubscribeUrl.replace(/&/g, "&amp;"));
    expect(email.text).toContain(base.unsubscribeUrl);
    expect(email.headers).toEqual({
      "List-Unsubscribe": `<${base.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(email.html.indexOf("PO Box")).toBeLessThan(email.html.indexOf("</body>"));
  });

  it("is not sent to anyone who hasn't opted in", () => {
    expect(planMarketingEmail({ ...base, optedIn: false })).toBeNull();
  });

  it("refuses to build one without an address or unsubscribe link", () => {
    expect(() => planMarketingEmail({ ...base, postalAddress: " " })).toThrow(MarketingEmailError);
    expect(() => planMarketingEmail({ ...base, unsubscribeUrl: "" })).toThrow(MarketingEmailError);
  });

  it("only marketing kinds go through the marketing path", () => {
    expect(() => planMarketingEmail({ ...base, kind: "digest" })).toThrow(/not a marketing/);
    expect(EMAIL_KINDS.subscription_confirmation).toBe("transactional");
  });

  it("digest and marketing unsubscribe links can't stand in for each other", async () => {
    const secret = "x".repeat(40);
    const user = "3f0c6a1e-8a4b-4c1d-9e2f-0123456789ab";
    const marketing = await signUnsubscribeToken(user, secret, "marketing");
    const digest = await signUnsubscribeToken(user, secret);
    expect(await verifyUnsubscribeToken(marketing, secret, "marketing")).toBe(user);
    expect(await verifyUnsubscribeToken(marketing, secret, "digest")).toBeNull();
    expect(await verifyUnsubscribeToken(digest, secret, "marketing")).toBeNull();
    expect(await verifyUnsubscribeToken(digest, secret)).toBe(user);
  });
});
