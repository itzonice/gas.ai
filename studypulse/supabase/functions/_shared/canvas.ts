import { CanvasOAuthError, needsRefresh, refreshCanvasToken } from "@studypulse/core/lms/index.ts";

import { HttpError } from "./http.ts";
import type { AdminClient } from "./supabase.ts";

export interface CanvasSession {
  connectionId: string;
  userId: string;
  baseUrl: string;
  accessToken: string;
}

/**
 * A usable access token for a connection, refreshed (and saved back to Vault) when it is
 * within 5 minutes of expiry. A refresh token Canvas no longer accepts marks the
 * connection needs_reauth and throws 409, so the user is asked to reconnect.
 */
export async function canvasSession(db: AdminClient, connectionId: string): Promise<CanvasSession> {
  const { data, error } = await db.rpc("lms_connection_credentials", {
    p_connection_id: connectionId,
  });
  if (error) throw error;
  const c = data[0];
  if (!c?.access_token || !c.base_url || !c.user_id) {
    throw new HttpError(404, "connection_not_found", "Canvas connection not found");
  }
  if (c.status !== "active") {
    throw new HttpError(409, "canvas_reauth_required", "Reconnect Canvas to keep syncing");
  }
  const expiresAt = c.access_token_expires_at ? new Date(c.access_token_expires_at) : null;
  if (!needsRefresh(expiresAt)) {
    return { connectionId, userId: c.user_id, baseUrl: c.base_url, accessToken: c.access_token };
  }
  if (!c.refresh_token || !c.client_id || !c.client_secret) {
    await db.rpc("lms_mark_needs_reauth", {
      p_connection_id: connectionId,
      p_error: "no refresh token",
    });
    throw new HttpError(409, "canvas_reauth_required", "Reconnect Canvas to keep syncing");
  }
  try {
    const fresh = await refreshCanvasToken(
      { baseUrl: c.base_url, clientId: c.client_id, clientSecret: c.client_secret },
      c.refresh_token,
    );
    const { error: saveError } = await db.rpc("lms_update_tokens", {
      p_connection_id: connectionId,
      p_access_token: fresh.accessToken,
      ...(fresh.expiresAt ? { p_expires_at: fresh.expiresAt.toISOString() } : {}),
      ...(fresh.refreshToken ? { p_refresh_token: fresh.refreshToken } : {}),
    });
    if (saveError) throw saveError;
    return { connectionId, userId: c.user_id, baseUrl: c.base_url, accessToken: fresh.accessToken };
  } catch (err) {
    if (err instanceof CanvasOAuthError && (err.status === 400 || err.status === 401)) {
      await db.rpc("lms_mark_needs_reauth", {
        p_connection_id: connectionId,
        p_error: err.message,
      });
      throw new HttpError(409, "canvas_reauth_required", "Reconnect Canvas to keep syncing");
    }
    throw err;
  }
}
