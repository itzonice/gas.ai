"use client";

// Email and password sign-in (and account creation). Errors are announced in an alert
// and tied to the form; after signing in the user goes back where they were headed.
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

import { Button, Icon, TextField } from "@/components/ui";
import { getSupabase, safeNext } from "@/lib/supabase";

import styles from "./auth.module.css";
import { useSession } from "./SessionProvider";

type Mode = "sign-in" | "sign-up";

export function SignInForm() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const session = useSession();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session.status === "signed-in") router.replace(next);
  }, [session.status, next, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    const auth = getSupabase().auth;
    const result =
      mode === "sign-in"
        ? await auth.signInWithPassword({ email, password })
        : await auth.signUp({ email, password });
    setBusy(false);
    if (result.error) {
      setError(
        result.error.message === "Invalid login credentials"
          ? "That email and password don't match an account."
          : result.error.message,
      );
      return;
    }
    if (mode === "sign-up" && !result.data.session) {
      setNotice("Check your email to confirm your account, then sign in.");
      setMode("sign-in");
      return;
    }
    router.replace(next);
  }

  const title = mode === "sign-in" ? "Sign in to StudyPulse" : "Create your account";
  return (
    <div className={styles.card}>
      <h1 className={styles.title}>{title}</h1>
      <form className={styles.form} onSubmit={onSubmit} aria-describedby="auth-message" noValidate>
        <div id="auth-message" aria-live="polite">
          {error ? (
            <p role="alert" className={styles.alert}>
              <Icon name="warning" size={20} />
              {error}
            </p>
          ) : null}
          {notice ? <p className={styles.switch}>{notice}</p> : null}
        </div>
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.currentTarget.value);
          }}
        />
        <TextField
          label="Password"
          type="password"
          name="password"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          required
          minLength={8}
          {...(mode === "sign-up" ? { hint: "At least 8 characters." } : {})}
          value={password}
          onChange={(e) => {
            setPassword(e.currentTarget.value);
          }}
        />
        <Button type="submit" variant="filled" disabled={busy}>
          {mode === "sign-in"
            ? busy
              ? "Signing in…"
              : "Sign in"
            : busy
              ? "Creating…"
              : "Create account"}
        </Button>
      </form>
      <p className={styles.switch}>
        {mode === "sign-in" ? "New to StudyPulse? " : "Already have an account? "}
        <Button
          variant="text"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
          }}
        >
          {mode === "sign-in" ? "Create an account" : "Sign in instead"}
        </Button>
      </p>
    </div>
  );
}
