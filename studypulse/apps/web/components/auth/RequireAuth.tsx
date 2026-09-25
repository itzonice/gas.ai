"use client";

// Screens inside the app shell need a signed-in user; everyone else goes to sign-in and
// comes back afterwards. New accounts go through onboarding first. The server enforces
// access (RLS); this only picks the screen.
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useApi, useSession } from "./SessionProvider";

// Checked once per user per page load; onboarding marks it done when it finishes.
const onboarded = new Map<string, boolean>();

export function markOnboarded(userId: string) {
  onboarded.set(userId, true);
}

export function RequireAuth({
  children,
  skipOnboarding = false,
}: {
  children: ReactNode;
  /** The onboarding screen itself. */
  skipOnboarding?: boolean;
}) {
  const state = useSession();
  const api = useApi();
  const router = useRouter();
  const userId = state.status === "signed-in" ? state.session.user.id : null;
  const [checked, setChecked] = useState<string | null>(null);

  useEffect(() => {
    if (state.status === "signed-out") {
      const here = window.location.pathname + window.location.search;
      router.replace(`/sign-in?next=${encodeURIComponent(here)}`);
    }
  }, [state.status, router]);

  useEffect(() => {
    if (!userId || skipOnboarding) return;
    if (onboarded.get(userId)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- cached answer
      setChecked(userId);
      return;
    }
    let cancelled = false;
    api.onboarding
      .needed()
      .then((needed) => {
        if (cancelled) return;
        if (needed) {
          router.replace("/onboarding");
          return;
        }
        onboarded.set(userId, true);
        setChecked(userId);
      })
      // If the check fails, don't lock the user out of the app.
      .catch(() => {
        if (!cancelled) setChecked(userId);
      });
    return () => {
      cancelled = true;
    };
  }, [api, router, skipOnboarding, userId]);

  if (state.status !== "signed-in") {
    return (
      <p role="status" className="sp-loading">
        {state.status === "loading" ? "Loading…" : "Redirecting to sign in…"}
      </p>
    );
  }
  if (!skipOnboarding && checked !== userId) {
    return (
      <p role="status" className="sp-loading">
        Loading…
      </p>
    );
  }
  return children;
}
