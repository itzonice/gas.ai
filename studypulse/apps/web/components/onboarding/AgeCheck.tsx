"use client";

// The age question for accounts made with Apple or Google, which can't carry a birth
// month at sign-up (launch safety S12). Shown before anything else; under 13, the server
// deletes the account and this signs the browser out.
import { AGE_MESSAGES, isOldEnough, toBirthMonth } from "@studypulse/core/auth";
import { TERMS_VERSION } from "@studypulse/core/legal";
import Link from "next/link";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { BirthMonthField, type BirthMonthValue } from "@/components/auth/BirthMonthField";
import { useApi } from "@/components/auth/SessionProvider";
import { Button } from "@/components/ui";
import { ageBlocked, recordAgeBlock } from "@/lib/age-block";
import { clearAppStorage } from "@/lib/sign-out";
import { getSupabase } from "@/lib/supabase";

import styles from "./onboarding.module.css";

type State = "checking" | "ask" | "confirmed" | "blocked";

export function AgeCheck({ children }: { children: ReactNode }) {
  const api = useApi();
  const [state, setState] = useState<State>("checking");
  const [birth, setBirth] = useState<BirthMonthValue>({ month: "", year: "" });
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Only the first answer counts; a later re-check must not undo a confirmation.
    const settle = (next: State) => {
      if (!cancelled) setState((s) => (s === "checking" ? next : s));
    };
    api.onboarding.ageConfirmed().then(
      (ok) => {
        settle(ok ? "confirmed" : "ask");
      },
      // The server refuses unconfirmed accounts anyway; asking again is harmless.
      () => {
        settle("ask");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api]);

  async function block() {
    recordAgeBlock();
    setState("blocked");
    await getSupabase()
      .auth.signOut({ scope: "local" })
      .catch(() => undefined);
    clearAppStorage();
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(undefined);
    const birthMonth = toBirthMonth(Number(birth.year), Number(birth.month));
    if (!birthMonth) {
      setError(AGE_MESSAGES.missing);
      return;
    }
    setSaving(true);
    try {
      // Under 13 still goes to the server, which deletes the account.
      const result = await api.onboarding.confirmAge(birthMonth);
      if (result === "blocked" || ageBlocked() || !isOldEnough(birthMonth)) await block();
      else {
        // Apple/Google accounts accept the Terms here (S21).
        await api.onboarding.acceptTerms(TERMS_VERSION);
        setState("confirmed");
      }
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (state === "confirmed") return <>{children}</>;
  if (state === "checking") {
    return (
      <p role="status" className="sp-loading">
        Loading…
      </p>
    );
  }
  if (state === "blocked") {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>You can&apos;t use StudyPulse</h1>
        <p className={styles.lead}>
          {AGE_MESSAGES.blocked} Your account and anything in it have been deleted.
        </p>
      </div>
    );
  }
  return (
    <div className={styles.card}>
      <h1 className={styles.title}>One question first</h1>
      <form className={styles.form} onSubmit={(e) => void submit(e)} noValidate>
        <BirthMonthField value={birth} onChange={setBirth} error={error} />
        <p className={styles.lead}>
          By continuing you agree to the <Link href="/terms">Terms of Use</Link> and{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Continue"}
        </Button>
      </form>
    </div>
  );
}
