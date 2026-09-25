"use client";

// Settings: account, study plan, reminders, plan, and your data. One form and one
// primary action (Save changes); only changed fields are sent. Features the server
// hasn't turned on (web push, email, billing) show as unavailable instead of failing.
import {
  ApiError,
  type Features,
  type NotificationPrefsUpdate,
  type ProfileUpdate,
  type Settings,
} from "@studypulse/core/api";
import type { BillingStatus } from "@studypulse/core/billing";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

import { useApi } from "@/components/auth/SessionProvider";
import { DAILY_MINUTES_OPTIONS, timezoneOptions } from "@/components/onboarding/timezones";
import { formatMinutes } from "@/components/today/model";
import {
  Button,
  CheckboxField,
  Dialog,
  Icon,
  PageHeader,
  SelectField,
  TextField,
} from "@/components/ui";
import { clearAppStorage, signOutEverywhere } from "@/lib/sign-out";
import { getSupabase } from "@/lib/supabase";
import { enableWebPush, webPushSupported } from "@/lib/web-push";

import { deviceSummary, planSummary, profileChanges, prefChanges } from "./model";
import styles from "./settings.module.css";

type Load =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      settings: Settings;
      billing: BillingStatus | null;
      features: Features | null;
    };

export type ProfileForm = Settings["profile"];
export type PrefsForm = Settings["notifications"];

export function SettingsScreen() {
  const api = useApi();
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [profile, setProfile] = useState<ProfileForm | null>(null);
  const [prefs, setPrefs] = useState<PrefsForm | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [settings, billing, features] = await Promise.all([
        api.settings.get(),
        api.billing.status().catch(() => null),
        api.features().catch(() => null),
      ]);
      setLoad({ status: "ready", settings, billing, features });
      setProfile(settings.profile);
      setPrefs(settings.notifications);
    } catch (e) {
      setLoad({
        status: "error",
        message: e instanceof Error ? e.message : "Something went wrong.",
      });
    }
  }, [api]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void refresh();
  }, [refresh]);

  async function save(e?: FormEvent) {
    e?.preventDefault();
    if (load.status !== "ready" || !profile || !prefs) return;
    const profileUpdate: ProfileUpdate = profileChanges(load.settings.profile, profile);
    const prefsUpdate: NotificationPrefsUpdate = prefChanges(load.settings.notifications, prefs);
    if (!Object.keys(profileUpdate).length && !Object.keys(prefsUpdate).length) {
      setMessage("Nothing to save.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.settings.updateProfile(profileUpdate);
      await api.settings.updateNotifications(prefsUpdate);
      await refresh();
      setMessage("Settings saved.");
    } catch (err) {
      setError(
        err instanceof ApiError && err.issues.length
          ? err.issues.map((i) => i.message).join(" ")
          : `Couldn't save: ${err instanceof Error ? err.message : "try again."}`,
      );
    } finally {
      setSaving(false);
    }
  }

  async function turnOnBrowserPush() {
    try {
      const ok = await enableWebPush(api);
      setMessage(
        ok
          ? "Reminders are on in this browser."
          : "Reminders weren't turned on. Allow notifications for this site in your browser.",
      );
      await refresh();
    } catch {
      setMessage("Couldn't turn on reminders in this browser. Try again.");
    }
  }

  async function manageSubscription() {
    try {
      window.location.assign(await api.billing.openPortal());
    } catch (err) {
      setError(`Couldn't open billing: ${err instanceof Error ? err.message : "try again."}`);
    }
  }

  async function exportData() {
    try {
      const blob = await api.account.exportData();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "studypulse-data.json";
      document.body.append(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setMessage("Your data was downloaded as a JSON file.");
    } catch (err) {
      setError(`Couldn't export your data: ${err instanceof Error ? err.message : "try again."}`);
    }
  }

  async function signOut() {
    await signOutEverywhere(api);
    router.replace("/sign-in");
  }

  const header = (
    <PageHeader
      title="Settings"
      description="Account, study plan, reminders, and your plan."
      {...(load.status === "ready"
        ? { primaryAction: { label: "Save changes", onClick: () => void save() } }
        : {})}
    />
  );

  if (load.status !== "ready" || !profile || !prefs) {
    return (
      <div className={styles.content}>
        {header}
        {load.status === "error" ? (
          <p role="alert" className={styles.alert}>
            <Icon name="warning" size={20} />
            Couldn&apos;t load your settings: {load.message}
            <Button variant="text" onClick={() => void refresh()}>
              Try again
            </Button>
          </p>
        ) : (
          <p role="status" className={styles.muted}>
            Loading your settings…
          </p>
        )}
      </div>
    );
  }

  const { settings, billing, features } = load;
  const webPushAvailable = Boolean(features?.webPush) && webPushSupported();
  const emailAvailable = Boolean(features?.email);
  const plan = planSummary(billing, settings.profile.plan_tier);
  const setP = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    setProfile((p) => (p ? { ...p, [key]: value } : p));
  const setN = <K extends keyof PrefsForm>(key: K, value: PrefsForm[K]) =>
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
  const remindersOff = !prefs.push_enabled;

  return (
    <div className={styles.content}>
      {header}

      <form className={styles.form} onSubmit={(e) => void save(e)} noValidate>
        <section className={styles.section} aria-labelledby="account-heading">
          <h2 id="account-heading" className={styles.sectionHeading}>
            Account
          </h2>
          <p className={styles.muted}>Signed in as {settings.email ?? "your account"}</p>
          <div className={styles.grid}>
            <TextField
              label="Name"
              autoComplete="name"
              maxLength={100}
              value={profile.display_name ?? ""}
              onChange={(e) => setP("display_name", e.target.value)}
            />
            <TextField
              label="School"
              hint="Optional."
              autoComplete="organization"
              maxLength={200}
              value={profile.school ?? ""}
              onChange={(e) => setP("school", e.target.value)}
            />
            <SelectField
              label="Timezone"
              hint="Due times, reminders, and your day follow this timezone."
              value={profile.timezone}
              onChange={(e) => setP("timezone", e.target.value)}
            >
              {timezoneOptions(profile.timezone).map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </SelectField>
          </div>
        </section>

        <section className={styles.section} aria-labelledby="study-heading">
          <h2 id="study-heading" className={styles.sectionHeading}>
            Study plan
          </h2>
          <div className={styles.grid}>
            <SelectField
              label="Study time a day"
              hint="Your plan never schedules more than this."
              value={String(profile.daily_study_minutes)}
              onChange={(e) => setP("daily_study_minutes", Number(e.target.value))}
            >
              {[...new Set([...DAILY_MINUTES_OPTIONS, profile.daily_study_minutes])]
                .sort((a, b) => a - b)
                .map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? "No study time" : formatMinutes(m)}
                  </option>
                ))}
            </SelectField>
            <TextField
              label="Start studying at"
              hint="Study blocks are placed from this time on."
              type="time"
              step={900}
              value={profile.study_start_time}
              onChange={(e) => setP("study_start_time", e.target.value)}
            />
          </div>
          <CheckboxField
            label="Add a card-making task after each class"
            hint="Turns the day's notes into review cards while they're fresh."
            checked={profile.card_tasks_enabled}
            onChange={(e) => setP("card_tasks_enabled", e.target.checked)}
          />
        </section>

        <section className={styles.section} aria-labelledby="reminders-heading">
          <h2 id="reminders-heading" className={styles.sectionHeading}>
            Reminders
          </h2>
          <p className={styles.muted}>{deviceSummary(settings.devices)}</p>
          {webPushAvailable ? (
            <div>
              <Button variant="tonal" icon="notifications" onClick={() => void turnOnBrowserPush()}>
                Turn on in this browser
              </Button>
            </div>
          ) : (
            <p className={styles.muted}>
              Browser reminders aren&apos;t available here; the StudyPulse app gets them.
            </p>
          )}
          <CheckboxField
            label="Send reminders"
            checked={prefs.push_enabled}
            onChange={(e) => setN("push_enabled", e.target.checked)}
          />
          <fieldset className={styles.fieldset} disabled={remindersOff}>
            <legend className={styles.legend}>Remind me</legend>
            <CheckboxField
              label="A day before something is due"
              checked={prefs.remind_24h}
              onChange={(e) => setN("remind_24h", e.target.checked)}
            />
            <CheckboxField
              label="Two hours before something is due"
              checked={prefs.remind_2h}
              onChange={(e) => setN("remind_2h", e.target.checked)}
            />
            <CheckboxField
              label="Exam countdown"
              hint="A week, three days, and the day before each exam."
              checked={prefs.exam_countdown}
              onChange={(e) => setN("exam_countdown", e.target.checked)}
            />
            <CheckboxField
              label="Morning summary of the day"
              checked={prefs.morning_digest}
              onChange={(e) => setN("morning_digest", e.target.checked)}
            />
            <div className={styles.grid}>
              <TextField
                label="Morning summary time"
                type="time"
                step={900}
                disabled={remindersOff || !prefs.morning_digest}
                value={prefs.morning_digest_time}
                onChange={(e) => setN("morning_digest_time", e.target.value)}
              />
              <TextField
                label="Most reminders a day"
                type="number"
                inputMode="numeric"
                min={1}
                max={50}
                value={String(prefs.daily_cap)}
                onChange={(e) => setN("daily_cap", Number(e.target.value))}
              />
            </div>
          </fieldset>
          <fieldset className={styles.fieldset} disabled={remindersOff}>
            <legend className={styles.legend}>Quiet hours</legend>
            <CheckboxField
              label="Hold reminders during quiet hours"
              checked={prefs.quiet_hours_enabled}
              onChange={(e) => setN("quiet_hours_enabled", e.target.checked)}
            />
            <div className={styles.grid}>
              <TextField
                label="From"
                type="time"
                step={900}
                disabled={remindersOff || !prefs.quiet_hours_enabled}
                value={prefs.quiet_hours_start}
                onChange={(e) => setN("quiet_hours_start", e.target.value)}
              />
              <TextField
                label="Until"
                type="time"
                step={900}
                disabled={remindersOff || !prefs.quiet_hours_enabled}
                value={prefs.quiet_hours_end}
                onChange={(e) => setN("quiet_hours_end", e.target.value)}
              />
            </div>
          </fieldset>
          <CheckboxField
            label="Email me a daily summary when push can't reach me"
            hint={emailAvailable ? undefined : "Email isn't available right now."}
            disabled={!emailAvailable}
            checked={prefs.email_digest_enabled}
            onChange={(e) => setN("email_digest_enabled", e.target.checked)}
          />
        </section>

        {error ? (
          <p role="alert" className={styles.alert}>
            <Icon name="warning" size={20} />
            {error}
          </p>
        ) : null}
        <div>
          <Button type="submit" variant="tonal" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>

      <section className={styles.section} id="plan" aria-labelledby="plan-heading">
        <h2 id="plan-heading" className={styles.sectionHeading}>
          Plan
        </h2>
        <p className={styles.planName}>{plan.title}</p>
        {plan.detail ? <p className={styles.muted}>{plan.detail}</p> : null}
        {billing?.payment_issue ? (
          <p role="alert" className={styles.alert}>
            <Icon name="warning" size={20} />
            Your last payment didn&apos;t go through. Update your payment method to keep Pro.
          </p>
        ) : null}
        <div className={styles.row}>
          {plan.action === "portal" && features?.stripe ? (
            <Button variant="tonal" onClick={() => void manageSubscription()}>
              Manage subscription
            </Button>
          ) : plan.action === "upgrade" ? (
            <Button variant="tonal" href="/upgrade">
              See Pro
            </Button>
          ) : null}
        </div>
      </section>

      <section className={styles.section} aria-labelledby="legal-heading">
        <h2 id="legal-heading" className={styles.sectionHeading}>
          Legal
        </h2>
        <div className={styles.row}>
          <Button variant="text" href="/terms">
            Terms of Use
          </Button>
          <Button variant="text" href="/privacy">
            Privacy Policy
          </Button>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="data-heading">
        <h2 id="data-heading" className={styles.sectionHeading}>
          Your data
        </h2>
        <div className={styles.row}>
          <Button variant="tonal" icon="download" onClick={() => void exportData()}>
            Export my data
          </Button>
          <Button variant="text" onClick={() => void signOut()}>
            Sign out
          </Button>
          <Button variant="danger" icon="delete" onClick={() => setDeleteOpen(true)}>
            Delete account
          </Button>
        </div>
      </section>

      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />

      <p role="status" aria-live="polite" className="sp-visually-hidden">
        {message}
      </p>
    </div>
  );
}

function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useApi();
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (typed !== "DELETE") {
      setError("Type DELETE in capital letters to confirm.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.account.delete("DELETE");
      // The account's sessions are gone with it; forget this browser's copy too.
      await getSupabase()
        .auth.signOut({ scope: "local" })
        .catch(() => undefined);
      clearAppStorage();
      router.replace("/sign-in?deleted=1");
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof ApiError && err.status === 503
          ? "Your subscription can't be cancelled right now, so the account wasn't deleted. Try again later."
          : `Couldn't delete your account: ${err instanceof Error ? err.message : "try again."}`,
      );
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Delete your account?" labelledBy="delete-title">
      <form className={styles.dialogForm} onSubmit={(e) => void confirm(e)} noValidate>
        <p>
          This permanently deletes your courses, grades, study history, and uploaded files, and
          cancels a web subscription. It can&apos;t be undone. Export your data first if you want a
          copy.
        </p>
        <TextField
          label="Type DELETE to confirm"
          autoComplete="off"
          value={typed}
          error={error || null}
          onChange={(e) => setTyped(e.target.value)}
        />
        <div className={styles.row}>
          <Button variant="text" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" icon="delete" disabled={busy}>
            {busy ? "Deleting…" : "Delete account"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
