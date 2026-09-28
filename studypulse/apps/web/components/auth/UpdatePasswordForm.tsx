"use client";

// The page a reset link opens: the link signs the user in for recovery (the Supabase
// client reads it from the URL), then they choose a new password.
import {
  AUTH_MESSAGES,
  isWeakPasswordError,
  PASSWORD_HINT,
  PASSWORD_MIN_LENGTH,
  passwordProblem,
} from "@studypulse/core/auth";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { Button, Icon, TextField } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";

import styles from "./auth.module.css";
import { useSession } from "./SessionProvider";

export function UpdatePasswordForm() {
  const router = useRouter();
  const session = useSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const { error: updateError } = await getSupabase().auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(
        isWeakPasswordError(updateError)
          ? AUTH_MESSAGES.weakPassword
          : "Couldn't save the new password. Request a new reset link and try again.",
      );
      return;
    }
    router.replace("/today");
  }

  if (session.status === "loading") {
    return (
      <p role="status" className="sp-loading">
        Checking your reset link…
      </p>
    );
  }
  if (session.status === "signed-out") {
    return (
      <div className={styles.card}>
        <h1 className={styles.title}>This link has expired</h1>
        <p className={styles.switch}>
          Reset links work once and expire after an hour.{" "}
          <a href="/reset-password">Request a new one</a>.
        </p>
      </div>
    );
  }
  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Choose a new password</h1>
      <form className={styles.form} onSubmit={(e) => void onSubmit(e)} noValidate>
        {error ? (
          <p role="alert" className={styles.alert}>
            <Icon name="warning" size={20} />
            {error}
          </p>
        ) : null}
        <TextField
          label="New password"
          type="password"
          autoComplete="new-password"
          hint={PASSWORD_HINT}
          required
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        <Button type="submit" variant="filled" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </Button>
      </form>
    </div>
  );
}
