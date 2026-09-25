// Google Calendar connection (OAuth 2.0 authorization-code flow, offline access).
//   POST /google-oauth/start       -> { "url": <Google consent page> }
//   GET  /google-oauth/callback    (Google redirects the browser here) -> redirect to the app
//   POST /google-oauth/disconnect  -> { "disconnected": true }
// The state is 32 random bytes, stored only as a SHA-256 hash, single use, valid for
// 10 minutes; it also says whose account to connect, since the callback has no session.
// Tokens go straight to Vault. On connect we create the StudyPulse calendar and run a
// first sync in the background.
import { encodeBase64Url } from "jsr:@std/encoding@^1/base64url";
import { encodeHex } from "jsr:@std/encoding@^1/hex";
import {
  exchangeGoogleCode,
  googleAuthorizeUrl,
  hasRequiredScopes,
  revokeGoogleToken,
} from "@studypulse/core/gcal/index.ts";
import type { Logger } from "@studypulse/core/observability/index.ts";

import { runInBackground } from "../_shared/background.ts";
import { env } from "../_shared/env.ts";
import { requireGoogleConfig, syncGoogleUser } from "../_shared/gcal.ts";
import { createHandler } from "../_shared/handler.ts";
import { HttpError, json, oauthCallbackQuery, parseQuery, requireMethod } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

async function sha256Hex(value: string): Promise<string> {
  return encodeHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  );
}

type Outcome = "connected" | "denied" | "expired" | "failed" | "scopes";

/** Back to the app's integrations page with an outcome, or a plain page without APP_URL. */
function finish(outcome: Outcome): Response {
  const app = env().APP_URL?.replace(/\/+$/, "");
  if (app) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: `${app}/settings/integrations?google=${outcome}`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  const text =
    outcome === "connected"
      ? "Google Calendar is connected. You can close this window."
      : outcome === "scopes"
        ? "Google Calendar needs both permissions to sync. Try again and leave both ticked."
        : `Google Calendar connection ${outcome}.`;
  return new Response(text, {
    status: outcome === "connected" ? 200 : 400,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function start(req: Request): Promise<Response> {
  requireMethod(req, "POST");
  const config = requireGoogleConfig();
  const user = await requireUser(req);
  const state = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const { error } = await adminClient().rpc("gcal_begin_oauth", {
    p_user_id: user.id,
    p_state_hash: await sha256Hex(state),
  });
  if (error) throw error;
  return json({
    url: googleAuthorizeUrl({
      clientId: config.client.clientId,
      redirectUri: config.redirectUri,
      state,
      ...(config.endpoints.authUrl ? { authUrl: config.endpoints.authUrl } : {}),
    }),
  });
}

async function callback(req: Request, log: Logger): Promise<Response> {
  requireMethod(req, "GET");
  const config = requireGoogleConfig();
  const params = parseQuery(req, oauthCallbackQuery);
  if (!params) return finish("expired");
  const { state } = params;

  const db = adminClient();
  const { data: userId, error } = await db.rpc("gcal_consume_oauth_state", {
    p_state_hash: await sha256Hex(state),
  });
  if (error) throw error;
  if (!userId) return finish("expired");
  if (params.error) return finish("denied");
  const { code } = params;
  if (!code) return finish("failed");

  let tokens;
  try {
    tokens = await exchangeGoogleCode(
      config.client,
      { code, redirectUri: config.redirectUri },
      config.endpoints,
    );
  } catch (err) {
    log.warn("google code exchange failed", { error: err });
    return finish("failed");
  }
  // Google lets people untick scopes on the consent screen; both are needed.
  if (tokens.scopes.length > 0 && !hasRequiredScopes(tokens.scopes)) {
    await revokeGoogleToken(tokens.accessToken, config.endpoints).catch(() => false);
    return finish("scopes");
  }

  const { error: saveError } = await db.rpc("gcal_save_connection", {
    p_user_id: userId,
    p_access_token: tokens.accessToken,
    ...(tokens.refreshToken ? { p_refresh_token: tokens.refreshToken } : {}),
    ...(tokens.expiresAt ? { p_expires_at: tokens.expiresAt.toISOString() } : {}),
  });
  if (saveError) throw saveError;

  runInBackground(
    syncGoogleUser(db, userId, log).then(
      (r) => log.info("first google sync", { user_id: userId, ...r }),
      (err: unknown) => log.warn("first google sync failed", { user_id: userId, error: err }),
    ),
  );
  return finish("connected");
}

async function disconnect(req: Request): Promise<Response> {
  requireMethod(req, "POST");
  const user = await requireUser(req);
  const db = adminClient();
  const { data, error } = await db.rpc("gcal_credentials", { p_user_id: user.id });
  if (error) throw error;
  const c = data[0];
  if (!c) throw new HttpError(404, "not_connected", "Google Calendar isn't connected");
  // Revoke at Google first (best effort; revoking the refresh token ends the grant).
  const token = c.refresh_token ?? c.access_token;
  const config = requireGoogleConfig();
  if (token) await revokeGoogleToken(token, config.endpoints).catch(() => false);
  // The StudyPulse calendar stays in their account; they can delete it in Google.
  const { error: deleteError } = await db.rpc("gcal_disconnect", { p_user_id: user.id });
  if (deleteError) throw deleteError;
  return json({ disconnected: true });
}

Deno.serve(
  createHandler("google-oauth", (req, { log }) => {
    const action = new URL(req.url).pathname.split("/").filter(Boolean).at(-1);
    switch (action) {
      case "start":
        return start(req);
      case "callback":
        return callback(req, log);
      case "disconnect":
        return disconnect(req);
      default:
        throw new HttpError(404, "not_found", "Use /start, /callback, or /disconnect");
    }
  }),
);
