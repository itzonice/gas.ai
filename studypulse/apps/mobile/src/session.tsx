// Tracks the Supabase session for the whole app.
import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { getSupabase } from "./lib/supabase";

export type SessionState =
  { status: "loading" } | { status: "signed-out" } | { status: "signed-in"; session: Session };

const SessionContext = createContext<SessionState>({ status: "loading" });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    const auth = getSupabase().auth;
    const apply = (session: Session | null) => {
      setState(session ? { status: "signed-in", session } : { status: "signed-out" });
    };
    void auth.getSession().then(({ data }) => {
      apply(data.session);
    });
    const { data } = auth.onAuthStateChange((_event, session) => {
      apply(session);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, []);

  return <SessionContext value={state}>{children}</SessionContext>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
