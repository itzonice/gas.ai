import { describe, expect, it, vi } from "vitest";

import { escapeHtml, planEmailDigest, type EmailDigestInput } from "./email-digest.ts";
import type { ReminderAssignment } from "./reminders.ts";
import { ResendError, sendResendBatch, type ResendEmail } from "./resend.ts";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe.ts";

const tz = "America/Chicago"; // CST (UTC-6) in early March 2027
const local = (date: string, time: string) => new Date(`${date}T${time}:00-06:00`);
const item = (
  title: string,
  dueAt: Date,
  extra: Partial<ReminderAssignment> = {},
): ReminderAssignment => ({
  id: title,
  title,
  course: "BIO 201",
  kind: "assignment",
  dueAt: dueAt.toISOString(),
  status: "todo",
  ...extra,
});
const digest = (
  now: Date,
  assignments: ReminderAssignment[],
  extra: Partial<EmailDigestInput> = {},
) =>
  planEmailDigest({
    timezone: tz,
    now,
    prefs: { morning_digest_time: "07:30:00" },
    assignments,
    unsubscribeUrl: "https://x.supabase.co/functions/v1/email-unsubscribe?token=t",
    ...extra,
  });

describe("planEmailDigest", () => {
  const items = [
    item("Lab 3", local("2027-03-01", "23:59")),
    item("Midterm", local("2027-03-02", "09:00"), { kind: "exam" }),
    item("Essay", local("2027-03-05", "17:00")),
    item("Done", local("2027-03-01", "12:00"), { status: "done" }),
    item("Far", local("2027-03-20", "12:00")),
  ];

  it("sends once a day at the digest time, and not hours late", () => {
    expect(digest(local("2027-03-01", "07:15"), items)).toBeNull();
    expect(digest(local("2027-03-01", "07:30"), items)?.dedupeKey).toBe("email_digest:2027-03-01");
    expect(digest(local("2027-03-01", "10:30"), items)).not.toBeNull();
    expect(digest(local("2027-03-01", "10:31"), items)).toBeNull();
  });

  it("ignores quiet hours: the digest time can be early", () => {
    const early = digest(local("2027-03-01", "05:00"), items, {
      prefs: { morning_digest_time: "05:00" },
    });
    expect(early).not.toBeNull();
  });

  it("lists today, tomorrow, and the rest of the week", () => {
    const d = digest(local("2027-03-01", "07:30"), items, {
      name: "Ada Lovelace",
      appUrl: "https://app.studypulse.test",
    })!;
    expect(d.subject).toBe("1 due today · 1 tomorrow");
    expect(d.text).toBe(
      [
        "Hi Ada, here's what's coming up.",
        "",
        "DUE TODAY",
        "- Lab 3 (BIO 201) — today at 11:59 PM",
        "",
        "DUE TOMORROW",
        "- [Exam] Midterm (BIO 201) — tomorrow at 9:00 AM",
        "",
        "COMING UP THIS WEEK",
        "- Essay (BIO 201) — Fri, Mar 5 at 5:00 PM",
        "",
        "Open StudyPulse: https://app.studypulse.test/today",
        "",
        "You get this email because push notifications are off for your account.",
        "Unsubscribe: https://x.supabase.co/functions/v1/email-unsubscribe?token=t",
      ].join("\n"),
    );
    expect(d.html).toContain("Exam: Midterm");
    expect(d.html).toContain('href="https://app.studypulse.test/today"');
    expect(d.html).toContain("email-unsubscribe?token=t");
    expect(d.html).not.toContain("Far");
    expect(d.html).not.toContain("Done");
  });

  it("escapes user text in the HTML", () => {
    const d = digest(local("2027-03-01", "07:30"), [
      item('<img src=x onerror="alert(1)">', local("2027-03-01", "20:00")),
    ])!;
    expect(d.html).not.toContain("<img");
    expect(d.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(escapeHtml(`&'`)).toBe("&amp;&#39;");
  });

  it("caps the week list and says how many more", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      item(`HW ${String(i)}`, local("2027-03-04", `1${String(i % 10)}:00`)),
    );
    const d = digest(local("2027-03-01", "07:30"), many)!;
    expect(d.subject).toBe("Your week ahead");
    expect(d.text).toContain("- and 3 more");
  });

  it("sends nothing when nothing is due within a week", () => {
    expect(
      digest(local("2027-03-01", "07:30"), [item("Far", local("2027-03-20", "12:00"))]),
    ).toBeNull();
  });
});

describe("sendResendBatch", () => {
  const email: ResendEmail = {
    from: "StudyPulse <reminders@studypulse.app>",
    to: ["ada@example.com"],
    subject: "s",
    html: "<p>h</p>",
    text: "t",
  };

  it("posts the batch with an idempotency key and returns ids in order", async () => {
    const fetchMock = vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(Response.json({ data: [{ id: "e1" }, { id: "e2" }] })),
    );
    const ids = await sendResendBatch([email, email], "digest:2027-03-01:abc", {
      apiKey: "re_test",
      fetch: fetchMock,
    });
    expect(ids).toEqual(["e1", "e2"]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails/batch");
    expect(init!.headers).toMatchObject({
      Authorization: "Bearer re_test",
      "Idempotency-Key": "digest:2027-03-01:abc",
    });
    expect(JSON.parse(init!.body as string)).toHaveLength(2);
  });

  it("throws ResendError with the API message on failure", async () => {
    const fetchMock = () =>
      Promise.resolve(Response.json({ message: "Too many requests" }, { status: 429 }));
    await expect(
      sendResendBatch([email], "k", { apiKey: "re_test", fetch: fetchMock }),
    ).rejects.toEqual(new ResendError(429, "Too many requests"));
  });

  it("refuses oversized batches and skips empty ones", async () => {
    const fetchMock = vi.fn();
    await expect(
      sendResendBatch(Array<ResendEmail>(101).fill(email), "k", { apiKey: "k", fetch: fetchMock }),
    ).rejects.toThrow(/at most 100/);
    expect(await sendResendBatch([], "k", { apiKey: "k", fetch: fetchMock })).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("unsubscribe tokens", () => {
  const secret = "s".repeat(32);
  const user = "3f0c6a1e-8a4b-4c1d-9e2f-0123456789ab";

  it("round-trips and rejects tampering", async () => {
    const token = await signUnsubscribeToken(user, secret);
    expect(await verifyUnsubscribeToken(token, secret)).toBe(user);
    const other = "3f0c6a1e-8a4b-4c1d-9e2f-0123456789ac";
    expect(await verifyUnsubscribeToken(token.replace(user, other), secret)).toBeNull();
    expect(await verifyUnsubscribeToken(token, "t".repeat(32))).toBeNull();
    expect(await verifyUnsubscribeToken(`${token}x`, secret)).toBeNull();
    expect(await verifyUnsubscribeToken("garbage", secret)).toBeNull();
    expect(await verifyUnsubscribeToken(`${user}.!!!`, secret)).toBeNull();
    expect(await verifyUnsubscribeToken(`${token}.extra`, secret)).toBeNull();
  });

  it("requires a strong secret", async () => {
    await expect(signUnsubscribeToken(user, "short")).rejects.toThrow(/32 characters/);
  });
});
