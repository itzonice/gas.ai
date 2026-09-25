// Canvas LMS connection (OAuth2 authorization-code flow).
//   POST /canvas-oauth/start       { "institution_id": uuid }   -> { "url": <Canvas approve page> }
//   GET  /canvas-oauth/callback    (Canvas redirects the browser here) -> redirect to the app
//   POST /canvas-oauth/disconnect  { "connection_id": uuid }    -> { "disconnected": true }
// The state parameter is 32 random bytes, stored only as a SHA-256 hash, single use, and
// valid for 10 minutes; it also carries who started the flow, so the callback (which has
// no Supabase session) knows whose account to connect. Tokens go straight to Vault.
import { encodeBase64Url } from "jsr:@std/encoding@^1/base64url";
import { encodeHex } from "jsr:@std/encoding@^1/hex";
import {
  canvasAuthorizeUrl,
  exchangeCanvasCode,
  revokeCanvasToken,
} from "@studypulse/core/lms/index.ts";
import { z } from "zod";

import { env } from "../_shared/env.ts";
import { createHandler } from "../_shared/handler.ts";
import {
  HttpError,
  json,
  oauthCallbackQuery,
  parseJsonBody,
  parseQuery,
  requireMethod,
} from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

async function sha256Hex(value: string): Promise<string> {
  return encodeHex(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
  );
}

function redirectUri(): string {
  return env().CANVAS_REDIRECT_URI ?? `${env().SUPABASE_URL}/functions/v1/canvas-oauth/callback`;
}

/** Back to the app's integrations page with an outcome, or a plain page without APP_URL. */
function finish(outcome: "connected" | "denied" | "expired" | "failed"): Response {
  const app = env().APP_URL?.replace(/\/+$/, "");
  if (app) {
    return new Response(null, {
      status: 303,
      headers: {
        Location: `${app}/settings/integrations?canvas=${outcome}`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
  const text =
    outcome === "connected"
      ? "Canvas is connected. You can close this window."
      : `Canvas connection ${outcome}.`;
  return new Response(text, {
    status: outcome === "connected" ? 200 : 400,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function start(req: Request): Promise<Response> {
  requireMethod(req, "POST");
  const user = await requireUser(req);
  const { institution_id } = await parseJsonBody(req, z.object({ institution_id: z.uuid() }));
  const db = adminClient();
  const { data: institutions, error } = await db.rpc("lms_institution_client", {
    p_institution_id: institution_id,
  });
  if (error) throw error;
  const inst = institutions[0];
  if (!inst?.base_url || !inst.client_id) {
    throw new HttpError(404, "institution_not_found", "That school isn't available");
  }

  const state = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const { error: stateError } = await db.rpc("lms_begin_oauth", {
    p_user_id: user.id,
    p_institution_id: institution_id,
    p_state_hash: await sha256Hex(state),
  });
  if (stateError) throw stateError;
  return json({
    url: canvasAuthorizeUrl({
      client: { baseUrl: inst.base_url, clientId: inst.client_id },
      redirectUri: redirectUri(),
      state,
    }),
  });
}

async function callback(
  req: Request,
  log: { warn: (m: string, f?: Record<string, unknown>) => void },
) {
  requireMethod(req, "GET");
  const params = parseQuery(req, oauthCallbackQuery);
  if (!params) return finish("expired");
  const { state } = params;

  const db = adminClient();
  const { data: rows, error } = await db.rpc("lms_consume_oauth_state", {
    p_state_hash: await sha256Hex(state),
  });
  if (error) throw error;
  const pending = rows[0];
  if (!pending?.user_id || !pending.institution_id) return finish("expired");
  // The user clicked "Cancel" on Canvas's approve page.
  if (params.error) return finish("denied");
  const { code } = params;
  if (!code) return finish("failed");

  const { data: institutions, error: instError } = await db.rpc("lms_institution_client", {
    p_institution_id: pending.institution_id,
  });
  if (instError) throw instError;
  const inst = institutions[0];
  if (!inst?.base_url || !inst.client_id || !inst.client_secret) return finish("failed");

  let tokens;
  try {
    tokens = await exchangeCanvasCode(
      { baseUrl: inst.base_url, clientId: inst.client_id, clientSecret: inst.client_secret },
      { code, redirectUri: redirectUri() },
    );
  } catch (err) {
    log.warn("canvas code exchange failed", { error: err, institution_id: pending.institution_id });
    return finish("failed");
  }
  const { error: saveError } = await db.rpc("lms_save_connection", {
    p_user_id: pending.user_id,
    p_institution_id: pending.institution_id,
    p_access_token: tokens.accessToken,
    ...(tokens.canvasUserId ? { p_external_user_id: tokens.canvasUserId } : {}),
    ...(tokens.canvasUserName ? { p_external_user_name: tokens.canvasUserName } : {}),
    ...(tokens.refreshToken ? { p_refresh_token: tokens.refreshToken } : {}),
    ...(tokens.expiresAt ? { p_expires_at: tokens.expiresAt.toISOString() } : {}),
  });
  if (saveError) throw saveError;
  return finish("connected");
}

async function disconnect(req: Request): Promise<Response> {
  requireMethod(req, "POST");
  const user = await requireUser(req);
  const { connection_id } = await parseJsonBody(req, z.object({ connection_id: z.uuid() }));
  const db = adminClient();
  const { data, error } = await db.rpc("lms_connection_credentials", {
    p_connection_id: connection_id,
  });
  if (error) throw error;
  const c = data[0];
  if (!c || c.user_id !== user.id) {
    throw new HttpError(404, "connection_not_found", "Canvas connection not found");
  }
  // Revoke at Canvas first (best effort), then forget the tokens.
  if (c.base_url && c.access_token) {
    await revokeCanvasToken(c.base_url, c.access_token).catch(() => false);
  }
  const { error: deleteError } = await db.rpc("lms_disconnect", { p_connection_id: connection_id });
  if (deleteError) throw deleteError;
  return json({ disconnected: true });
}

Deno.serve(
  createHandler("canvas-oauth", (req, { log }) => {
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
