// Which emails are marketing, and what a marketing email must carry (launch safety S15).
//
// Transactional email is sent because of something the student did or asked for.
// Marketing email (news, tips, offers) goes only to students who opted in, and every one
// carries our postal address (CAN-SPAM; a PO box is fine) and a one-click unsubscribe
// (RFC 8058) that takes effect immediately. planMarketingEmail is the only way to build
// one: it refuses to produce an email that's missing either.
import { escapeHtml } from "./email-digest.ts";

export type EmailCategory = "transactional" | "marketing";

/** Every kind of email StudyPulse sends. A new kind must be classified here. */
export const EMAIL_KINDS = {
  /** The daily digest the student turned on (still has one-click unsubscribe). */
  digest: "transactional",
  subscription_confirmation: "transactional",
  renewal_reminder: "transactional",
  /** Auth email (confirm, reset) is sent by Supabase Auth. */
  account: "transactional",
  product_news: "marketing",
} as const satisfies Record<string, EmailCategory>;
export type EmailKind = keyof typeof EMAIL_KINDS;

/** RFC 8058 one-click unsubscribe headers. */
export function unsubscribeHeaders(unsubscribeUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubscribeUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export class MarketingEmailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketingEmailError";
  }
}

export interface MarketingEmailInput {
  kind: EmailKind;
  /** The recipient's current preference, read just before sending. */
  optedIn: boolean;
  subject: string;
  /** Body HTML (already escaped) and plain text, without footer. */
  html: string;
  text: string;
  unsubscribeUrl: string;
  /** Our physical mailing address (COMPANY_POSTAL_ADDRESS). */
  postalAddress: string | undefined;
  companyName: string;
}

export interface MarketingEmail {
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

/**
 * A compliant marketing email, or null when this student hasn't opted in. Throws if the
 * kind isn't marketing or the postal address or unsubscribe link is missing.
 */
export function planMarketingEmail(input: MarketingEmailInput): MarketingEmail | null {
  if (EMAIL_KINDS[input.kind] !== "marketing") {
    throw new MarketingEmailError(`${input.kind} is not a marketing email`);
  }
  const address = input.postalAddress?.trim();
  if (!address) {
    throw new MarketingEmailError("marketing email needs COMPANY_POSTAL_ADDRESS");
  }
  if (!input.unsubscribeUrl.startsWith("https://")) {
    throw new MarketingEmailError("marketing email needs an https unsubscribe link");
  }
  if (!input.optedIn) return null;

  const e = escapeHtml;
  const footerHtml =
    `<p style="font-size:12px;color:#5d6573;margin-top:32px">` +
    `You get this because you asked for StudyPulse news in Settings. ` +
    `<a href="${e(input.unsubscribeUrl)}" style="color:#5d6573">Unsubscribe</a> ` +
    `(one click, takes effect right away).<br>${e(input.companyName)} · ${e(address)}</p>`;
  const footerText = [
    "",
    "You get this because you asked for StudyPulse news in Settings.",
    `Unsubscribe (one click, takes effect right away): ${input.unsubscribeUrl}`,
    `${input.companyName} · ${address}`,
  ].join("\n");
  return {
    subject: input.subject,
    html: input.html.includes("</body>")
      ? input.html.replace("</body>", `${footerHtml}</body>`)
      : input.html + footerHtml,
    text: input.text + "\n" + footerText,
    headers: unsubscribeHeaders(input.unsubscribeUrl),
  };
}
