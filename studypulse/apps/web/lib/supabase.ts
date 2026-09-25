// The browser's Supabase client and API client. One instance per tab; the session lives in
// localStorage and refreshes itself. Only the anon key is used here (rule 7).
import { createApiClient, type ApiClient } from "@studypulse/core/api";
import type { Database } from "@studypulse/db";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "./env";

let supabase: SupabaseClient<Database> | undefined;
let api: ApiClient | undefined;

export function getSupabase(): SupabaseClient<Database> {
  supabase ??= createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
  );
  return supabase;
}

export function getApi(): ApiClient {
  api ??= createApiClient(getSupabase());
  return api;
}

/** Only same-site paths are allowed as a post-sign-in destination. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
    ? next
    : "/today";
}
