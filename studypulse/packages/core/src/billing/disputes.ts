// Chargebacks (launch safety S20). With low early volume a handful of disputes can push
// the account over Stripe's thresholds (holds, reserves, closure), so every dispute
// alerts the owner, evidence is gathered automatically, and the 90-day dispute rate is
// watched against 0.5%.
import type { DisputeEvidence } from "./stripe.ts";
import { CANCEL_INSTRUCTIONS } from "./terms.ts";

/** Stripe starts watching accounts well before 1%; we alert at half of that. */
export const DISPUTE_RATE_ALERT = 0.005;
/** Stripe's text evidence fields hold up to 20,000 characters. */
const MAX_FIELD = 19_000;

export interface EvidenceFacts {
  email: string | null;
  name: string | null;
  termsAcceptances: { version: string; context: string; accepted_at: string }[];
  signIns: { at: string; user_agent: string | null }[];
  usage: {
    courses: number;
    uploads: number;
    study_sessions: number;
    study_minutes: number;
    first_active_at: string | null;
    last_active_at: string | null;
  };
  appUrl: string;
  /** When the disputed charge was made (Unix seconds). */
  chargeCreated: number;
}

const clip = (s: string) => (s.length > MAX_FIELD ? `${s.slice(0, MAX_FIELD)}\n[truncated]` : s);
const day = (seconds: number) => new Date(seconds * 1000).toISOString().slice(0, 10);

/** Text evidence for Stripe, from what we know about the account. */
export function buildDisputeEvidence(facts: EvidenceFacts): DisputeEvidence {
  const u = facts.usage;
  const terms = facts.termsAcceptances
    .map((t) => `- Accepted Terms version ${t.version} at ${t.context} on ${t.accepted_at}`)
    .join("\n");
  const signIns = facts.signIns
    .map((s) => `- ${s.at}${s.user_agent ? ` (${s.user_agent})` : ""}`)
    .join("\n");
  return {
    ...(facts.email ? { customer_email_address: facts.email } : {}),
    ...(facts.name ? { customer_name: facts.name } : {}),
    product_description:
      "StudyPulse Pro: a subscription to a web and mobile study planner that reads course " +
      "syllabi and plans study time. Delivered online immediately after payment.",
    service_date: day(facts.chargeCreated),
    access_activity_log: clip(
      [
        `Account activity: ${String(u.courses)} courses, ${String(u.uploads)} syllabus uploads, ` +
          `${String(u.study_sessions)} study sessions (${String(u.study_minutes)} minutes).`,
        `First activity: ${u.first_active_at ?? "none"}. Last activity: ${u.last_active_at ?? "none"}.`,
        signIns ? `Recent sign-ins:\n${signIns}` : "No sign-ins recorded.",
      ].join("\n"),
    ),
    cancellation_policy_disclosure: clip(
      `Shown next to the subscribe button and in the confirmation email: "Renews automatically ` +
        `until you cancel. ${CANCEL_INSTRUCTIONS}" Terms: ${facts.appUrl}/terms`,
    ),
    refund_policy_disclosure: `Refund policy: ${facts.appUrl}/refunds (linked at checkout).`,
    uncategorized_text: clip(
      terms ? `Terms of Service acceptance records:\n${terms}` : "No Terms acceptance on record.",
    ),
  };
}

export interface DisputeRate {
  disputes: number;
  charges: number;
  rate: number;
  overThreshold: boolean;
}

export function disputeRate(disputes: number, charges: number): DisputeRate {
  // No charges on record but a dispute exists: treat as over (it can only be bad news).
  const rate = charges > 0 ? disputes / charges : disputes > 0 ? 1 : 0;
  return { disputes, charges, rate, overThreshold: rate > DISPUTE_RATE_ALERT };
}

export function formatDisputeAlert(input: {
  disputeId: string;
  amountCents: number;
  currency: string;
  reason: string;
  dueBy: number | null;
  userId: string | null;
  rate: DisputeRate;
}): string {
  const amount = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: input.currency.toUpperCase(),
  }).format(input.amountCents / 100);
  const pct = (input.rate.rate * 100).toFixed(2);
  return [
    `New Stripe dispute ${input.disputeId}: ${amount}, reason "${input.reason}".`,
    input.dueBy ? `Evidence due by ${new Date(input.dueBy * 1000).toISOString()}.` : "",
    `Evidence was staged (not submitted); review and submit it in the Stripe dashboard.`,
    input.userId ? `Account: ${input.userId}.` : "Account: unknown.",
    `90-day dispute rate: ${String(input.rate.disputes)}/${String(input.rate.charges)} = ${pct}%` +
      (input.rate.overThreshold ? ` — ABOVE ${String(DISPUTE_RATE_ALERT * 100)}%, act now.` : "."),
  ]
    .filter(Boolean)
    .join("\n");
}
