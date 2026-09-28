// Sign-out (launch safety S5): revoke every session for the account (all devices), then
// clear what this browser keeps. The database also refuses tokens from ended sessions
// (request_guard.require_live_session), so a copied token stops working right away.
import type { ApiClient } from "@studypulse/core/api";

import { getSupabase } from "./supabase";
import { disableWebPush } from "./web-push";

/** Removes StudyPulse's own browser storage (the focus timer run, UI preferences). */
export function clearAppStorage(): void {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("studypulse.")) window.localStorage.removeItem(key);
    }
    window.sessionStorage.clear();
  } catch {
    // Storage blocked: nothing stored to clear.
  }
}

export async function signOutEverywhere(api: ApiClient): Promise<void> {
  await disableWebPush(api).catch(() => undefined);
  const auth = getSupabase().auth;
  const { error } = await auth.signOut({ scope: "global" });
  // Offline or already revoked: still forget the session in this browser.
  if (error) await auth.signOut({ scope: "local" });
  clearAppStorage();
}
