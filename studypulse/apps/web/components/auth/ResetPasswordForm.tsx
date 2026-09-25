"use client";

// Asks for a password reset link. The answer is the same whether or not an account
// exists for the email (launch safety S6).
import { authErrorMessage } from "@studypulse/core/auth";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button, TextField } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";

import styles from "./auth.module.css";

export function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/update-password`,
    });
    setBusy(false);
    setMessage(authErrorMessage("reset", error));
  }

  return (
    <div className={styles.card}>
      <h1 className={styles.title}>Reset your password</h1>
      <form className={styles.form} onSubmit={(e) => void onSubmit(e)} noValidate>
        <p role="status" aria-live="polite" className={styles.switch}>
          {message}
        </p>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
        />
        <Button type="submit" variant="filled" disabled={busy}>
          {busy ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <p className={styles.switch}>
        <Link href="/sign-in">Back to sign in</Link>
      </p>
    </div>
  );
}
