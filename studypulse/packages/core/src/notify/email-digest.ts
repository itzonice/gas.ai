// The daily email digest for users push doesn't reach (push turned off, or no device).
// Pure: send-email-digests loads the data, calls planEmailDigest every 15 minutes, and
// sends what it returns. Sent once per local day at the user's digest time; quiet
// hours don't apply (email is silent).
import { daysBetween, localDate, zonedParts } from "../time/index.ts";
import { formatDue } from "./format.ts";
import { clockMinutes, type ReminderAssignment, type ReminderPrefs } from "./reminders.ts";

export interface EmailDigestInput {
  timezone: string;
  now: Date;
  prefs: Pick<ReminderPrefs, "morning_digest_time">;
  assignments: readonly ReminderAssignment[];
  name?: string | null;
  /** Web app origin for links (omitted from the email if unset). */
  appUrl?: string;
  /** One-click unsubscribe URL; required, every digest carries one. */
  unsubscribeUrl: string;
}

export interface EmailDigest {
  dedupeKey: string;
  subject: string;
  html: string;
  text: string;
}

/** Items shown in "Coming up"; the rest are summarized as "and N more". */
const UPCOMING_LIMIT = 8;
const UPCOMING_DAYS = 7;
/** A digest more than this late (e.g. the cron was down) is skipped until tomorrow. */
const LATE_LIMIT_MINUTES = 180;

const open = (a: ReminderAssignment) => a.status === "todo" || a.status === "in_progress";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface Section {
  heading: string;
  items: { title: string; course: string; when: string; exam: boolean }[];
  more: number;
}

function sections(input: EmailDigestInput, today: string): Section[] {
  const item = (a: ReminderAssignment) => ({
    title: a.title,
    course: a.course,
    when: formatDue(new Date(a.dueAt), input.timezone, input.now),
    exam: a.kind === "exam",
  });
  const upcoming = input.assignments
    .filter((a) => open(a) && Date.parse(a.dueAt) > input.now.getTime())
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  const dayOf = (a: ReminderAssignment) =>
    daysBetween(today, localDate(new Date(a.dueAt), input.timezone));

  const dueToday = upcoming.filter((a) => dayOf(a) === 0);
  const dueTomorrow = upcoming.filter((a) => dayOf(a) === 1);
  const later = upcoming.filter((a) => dayOf(a) > 1 && dayOf(a) <= UPCOMING_DAYS);
  return [
    { heading: "Due today", items: dueToday.map(item), more: 0 },
    { heading: "Due tomorrow", items: dueTomorrow.map(item), more: 0 },
    {
      heading: "Coming up this week",
      items: later.slice(0, UPCOMING_LIMIT).map(item),
      more: Math.max(0, later.length - UPCOMING_LIMIT),
    },
  ].filter((s) => s.items.length > 0);
}

function subjectLine(parts: Section[]): string {
  const count = (heading: string) => parts.find((s) => s.heading === heading)?.items.length ?? 0;
  const today = count("Due today");
  const tomorrow = count("Due tomorrow");
  if (today)
    return `${String(today)} due today${tomorrow ? ` · ${String(tomorrow)} tomorrow` : ""}`;
  if (tomorrow) return `${String(tomorrow)} due tomorrow`;
  return "Your week ahead";
}

function renderText(input: EmailDigestInput, greeting: string, parts: Section[]): string {
  const lines = [greeting, ""];
  for (const s of parts) {
    lines.push(s.heading.toUpperCase());
    for (const i of s.items) {
      lines.push(`- ${i.exam ? "[Exam] " : ""}${i.title} (${i.course}) — ${i.when}`);
    }
    if (s.more) lines.push(`- and ${String(s.more)} more`);
    lines.push("");
  }
  if (input.appUrl) lines.push(`Open StudyPulse: ${input.appUrl}/today`, "");
  lines.push(
    "You get this email because push notifications are off for your account.",
    `Unsubscribe: ${input.unsubscribeUrl}`,
  );
  return lines.join("\n");
}

function renderHtml(input: EmailDigestInput, greeting: string, parts: Section[]): string {
  const e = escapeHtml;
  const body = parts
    .map((s) => {
      const rows = s.items
        .map(
          (i) =>
            `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">` +
            `<strong>${i.exam ? "Exam: " : ""}${e(i.title)}</strong><br>` +
            `<span style="color:#5d6573">${e(i.course)} · ${e(i.when)}</span></td></tr>`,
        )
        .join("");
      const more = s.more
        ? `<tr><td style="padding:6px 0;color:#5d6573">and ${String(s.more)} more</td></tr>`
        : "";
      return (
        `<h2 style="font-size:16px;margin:24px 0 4px">${e(s.heading)}</h2>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}${more}</table>`
      );
    })
    .join("");
  const cta = input.appUrl
    ? `<p style="margin:24px 0"><a href="${e(`${input.appUrl}/today`)}" style="background:#0f7466;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Open StudyPulse</a></p>`
    : "";
  return (
    `<!doctype html><html><body style="margin:0;padding:24px;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1b2230;background:#f6f7f4">` +
    `<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px">` +
    `<p style="margin:0">${e(greeting)}</p>${body}${cta}` +
    `<p style="font-size:12px;color:#5d6573;margin-top:32px">You get this email because push notifications are off for your account. ` +
    `<a href="${e(input.unsubscribeUrl)}" style="color:#5d6573">Unsubscribe</a></p>` +
    `</div></body></html>`
  );
}

/** The digest to send now, or null (not time yet, already too late, or nothing due). */
export function planEmailDigest(input: EmailDigestInput): EmailDigest | null {
  const p = zonedParts(input.now, input.timezone);
  const past = p.hour * 60 + p.minute - clockMinutes(input.prefs.morning_digest_time);
  if (past < 0 || past > LATE_LIMIT_MINUTES) return null;

  const today = localDate(input.now, input.timezone);
  const parts = sections(input, today);
  if (!parts.length) return null;

  const first = input.name?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first}, here's what's coming up.` : "Here's what's coming up.";
  return {
    dedupeKey: `email_digest:${today}`,
    subject: subjectLine(parts),
    html: renderHtml(input, greeting, parts),
    text: renderText(input, greeting, parts),
  };
}
