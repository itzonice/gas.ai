"use client";

// Screens inside the app shell need a signed-in user; everyone else goes to sign-in and
// comes back afterwards. The server enforces access (RLS); this only picks the screen.
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { useSession } from "./SessionProvider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const state = useSession();
  const router = useRouter();

  useEffect(() => {
    if (state.status === "signed-out") {
      const here = window.location.pathname + window.location.search;
      router.replace(`/sign-in?next=${encodeURIComponent(here)}`);
    }
  }, [state.status, router]);

  if (state.status !== "signed-in") {
    return (
      <p role="status" className="sp-loading">
        {state.status === "loading" ? "Loading…" : "Redirecting to sign in…"}
      </p>
    );
  }
  return children;
}
