// Subscription confirmation and yearly renewal reminder emails (launch safety S16), built
// from Stripe invoice events. Both are transactional and repeat the terms shown at
// checkout: price, how often, that it renews until canceled, and how to cancel.
//
// - invoice.paid with billing_reason "subscription_create": the confirmation.
// - invoice.upcoming for a yearly price: the reminder (Stripe sends it N days ahead; set
//   "Upcoming renewal events" to at least 7 days in the Stripe dashboard).
import { z } from "zod";

import { escapeHtml } from "../notify/email-digest.ts";
import type { StripeEvent } from "./stripe-webhook.ts";
import { formatPrice, subscriptionTerms } from "./terms.ts";

const invoiceSchema = z.looseObject({
  object: z.literal("invoice"),
  customer_email: z.email().nullish(),
  billing_reason: z.string().nullish(),
  currency: z.string(),
  amount_paid: z.number().int().optional(),
  amount_due: z.number().int().optional(),
  next_payment_attempt: z.number().int().nullish(),
  lines: z.looseObject({
    data: z.array(
      z.looseObject({
        period: z.looseObject({ end: z.number().int() }).optional(),
        price: z
          .looseObject({
            recurring: z.looseObject({ interval: z.string() }).nullish(),
          })
          .nullish(),
        pricing: z.unknown().optional(),
      }),
    ),
  }),
});

export interface BillingEmail {
  kind: "subscription_confirmation" | "renewal_reminder";
  to: string;
  subject: string;
  html: string;
  text: string;
}

function dateLabel(seconds: number): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(seconds * 1000),
  );
}

function render(
  lines: { heading: string; intro: string; terms: string[] },
  appUrl: string | undefined,
  support: string | undefined,
) {
  const e = escapeHtml;
  const manage = appUrl ? `${appUrl}/settings#plan` : null;
  const html =
    `<!doctype html><html><body style="margin:0;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1b2230;background:#f6f7f4">` +
    `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px">` +
    `<h1 style="font-size:20px;margin:0 0 12px">${e(lines.heading)}</h1>` +
    `<p>${e(lines.intro)}</p><ul>${lines.terms.map((t) => `<li>${e(t)}</li>`).join("")}</ul>` +
    (manage
      ? `<p><a href="${e(manage)}" style="color:#0f7466">Manage or cancel your subscription</a></p>`
      : "") +
    (support ? `<p style="font-size:12px;color:#5d6573">Questions? ${e(support)}</p>` : "") +
    `</div></body></html>`;
  const text = [
    lines.heading,
    "",
    lines.intro,
    ...lines.terms.map((t) => `- ${t}`),
    ...(manage ? ["", `Manage or cancel: ${manage}`] : []),
    ...(support ? ["", `Questions? ${support}`] : []),
  ].join("\n");
  return { html, text };
}

/** The email a Stripe event calls for, or null. */
export function billingEmailFromEvent(
  event: StripeEvent,
  context: { appUrl?: string; supportEmail?: string } = {},
): BillingEmail | null {
  if (event.type !== "invoice.paid" && event.type !== "invoice.upcoming") return null;
  const parsed = invoiceSchema.safeParse(event.data.object);
  if (!parsed.success) return null;
  const invoice = parsed.data;
  const to = invoice.customer_email;
  if (!to) return null;
  const line = invoice.lines.data[0];
  const unit = line?.price?.recurring?.interval;
  if (unit !== "month" && unit !== "year") return null;
  const interval = unit === "month" ? "monthly" : "yearly";

  if (event.type === "invoice.paid") {
    if (invoice.billing_reason !== "subscription_create") return null;
    const amount = { amount_cents: invoice.amount_paid ?? 0, currency: invoice.currency };
    const t = subscriptionTerms(interval, amount);
    const next = line?.period?.end;
    const { html, text } = render(
      {
        heading: "You're on StudyPulse Pro",
        intro: `Thanks for subscribing. You paid ${formatPrice(amount)} today. Here are your terms:`,
        terms: [
          `${t.price ?? ""} (${t.frequency.toLowerCase()})`,
          next ? `${t.renewal} Next charge: ${dateLabel(next)}.` : t.renewal,
          t.cancel,
        ],
      },
      context.appUrl,
      context.supportEmail,
    );
    return {
      kind: "subscription_confirmation",
      to,
      subject: "Your StudyPulse Pro subscription",
      html,
      text,
    };
  }

  // invoice.upcoming: remind before yearly renewals only (monthly would be every month).
  if (interval !== "yearly") return null;
  const amount = { amount_cents: invoice.amount_due ?? 0, currency: invoice.currency };
  const t = subscriptionTerms("yearly", amount);
  const when = invoice.next_payment_attempt ?? line?.period?.end;
  const { html, text } = render(
    {
      heading: "Your StudyPulse Pro plan renews soon",
      intro: `Your yearly plan renews${when ? ` on ${dateLabel(when)}` : " soon"} for ${formatPrice(amount)}.`,
      terms: [t.renewal, t.cancel],
    },
    context.appUrl,
    context.supportEmail,
  );
  return {
    kind: "renewal_reminder",
    to,
    subject: "Your StudyPulse Pro plan renews soon",
    html,
    text,
  };
}
