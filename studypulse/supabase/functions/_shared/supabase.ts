import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@studypulse/db";

import { env } from "./env.ts";
import { HttpError } from "./http.ts";

export type AdminClient = SupabaseClient<Database>;

let admin: AdminClient | undefined;

/** Service-role client: bypasses RLS. Only use after checking the caller's permissions. */
export function adminClient(): AdminClient {
  admin ??= createClient<Database>(env().SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/** Client that acts as the caller, so RLS applies to every query. */
export function userClient(req: Request): SupabaseClient<Database> {
  return createClient<Database>(env().SUPABASE_URL, env().SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

export interface AuthedUser {
  id: string;
  email: string | undefined;
  /** The user proved they own `email` (clicked the confirmation link). */
  emailConfirmed: boolean;
}

/** Verifies the bearer token with Supabase Auth and returns the user, or throws 401. */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const header = req.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token) throw new HttpError(401, "unauthorized", "Missing bearer token");

  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "unauthorized", "Invalid or expired token");
  return {
    id: data.user.id,
    email: data.user.email,
    emailConfirmed: Boolean(data.user.email_confirmed_at),
  };
}
