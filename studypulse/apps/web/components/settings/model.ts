// Pure helpers for the Settings screen: which fields changed, and plan/device wording.
import type { NotificationPrefsUpdate, ProfileUpdate, Settings } from "@studypulse/core/api";
import type { BillingStatus } from "@studypulse/core/billing";
import { STORE_SUBSCRIPTION_URLS } from "@studypulse/core/legal";

type Profile = Settings["profile"];
type Prefs = Settings["notifications"];

/** Only the profile fields that differ from what's saved, in API shape. */
export function profileChanges(saved: Profile, form: Profile): ProfileUpdate {
  const out: ProfileUpdate = {};
  const text = (v: string | null) => (v ?? "").trim();
  if (text(form.display_name) !== text(saved.display_name))
    out.displayName = text(form.display_name) || null;
  if (text(form.school) !== text(saved.school)) out.school = text(form.school) || null;
  if (form.timezone !== saved.timezone) out.timezone = form.timezone;
  if (form.daily_study_minutes !== saved.daily_study_minutes)
    out.dailyStudyMinutes = form.daily_study_minutes;
  if (form.study_start_time !== saved.study_start_time) out.studyStartTime = form.study_start_time;
  if (form.card_tasks_enabled !== saved.card_tasks_enabled)
    out.cardTasksEnabled = form.card_tasks_enabled;
  return out;
}

/** Only the reminder preferences that differ from what's saved. */
export function prefChanges(saved: Prefs, form: Prefs): NotificationPrefsUpdate {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(form) as (keyof Prefs)[]) {
    if (form[key] !== saved[key]) out[key] = form[key];
  }
  return out as NotificationPrefsUpdate;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/** "Reminders go to 1 phone and 2 browsers." */
export function deviceSummary(devices: Settings["devices"]): string {
  if (devices.mobile === 0 && devices.web === 0) {
    return "No devices get reminders yet. Turn them on in the app or in this browser.";
  }
  const parts: string[] = [];
  if (devices.mobile) parts.push(plural(devices.mobile, "phone", "phones"));
  if (devices.web) parts.push(plural(devices.web, "browser", "browsers"));
  return `Reminders go to ${parts.join(" and ")}.`;
}

const STORE_NAMES = { app_store: "the App Store", play_store: "Google Play", amazon: "Amazon" };

export function planSummary(
  billing: BillingStatus | null,
  tier: "free" | "pro",
): {
  title: string;
  detail: string | null;
  action: "portal" | "upgrade" | "store" | null;
  /** For a store subscription: the store's own subscriptions page, where it's cancelled. */
  storeUrl?: string;
} {
  const pro = billing ? billing.pro : tier === "pro";
  if (!pro) {
    return {
      title: "Free plan",
      detail: "3 active courses and 3 syllabus imports a day.",
      action: "upgrade",
    };
  }
  const sub = billing?.subscription;
  const end = sub?.current_period_end
    ? new Intl.DateTimeFormat("en-US", { dateStyle: "long" }).format(
        new Date(sub.current_period_end),
      )
    : null;
  const detail = end ? (sub?.cancel_at_period_end ? `Ends on ${end}.` : `Renews on ${end}.`) : null;
  const where = billing?.manage_in;
  if (where && where !== "stripe_portal") {
    const storeUrl = where === "amazon" ? undefined : STORE_SUBSCRIPTION_URLS[where];
    return {
      title: "StudyPulse Pro",
      detail: `${detail ? `${detail} ` : ""}Manage it in ${STORE_NAMES[where]}.`,
      action: storeUrl ? "store" : null,
      ...(storeUrl ? { storeUrl } : {}),
    };
  }
  return { title: "StudyPulse Pro", detail, action: where === "stripe_portal" ? "portal" : null };
}
