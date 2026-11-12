// The app's Supabase client and API client. The session lives in AsyncStorage and
// refreshes itself while the app is in the foreground. Only the anon key ships in the
// app (rule 7).
import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createApiClient, type ApiClient } from "@studypulse/core/api";
import type { Database } from "@studypulse/db";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState } from "react-native";

import { env } from "../env";

let supabase: SupabaseClient<Database> | undefined;
let api: ApiClient | undefined;

export function getSupabase(): SupabaseClient<Database> {
  if (!supabase) {
    const client = createClient<Database>(
      env.EXPO_PUBLIC_SUPABASE_URL,
      env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      },
    );
    // Refresh tokens only while the app is open; resume when it comes back.
    AppState.addEventListener("change", (state) => {
      if (state === "active") void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
    supabase = client;
  }
  return supabase;
}

export function getApi(): ApiClient {
  api ??= createApiClient(getSupabase());
  return api;
}
