// /email-unsubscribe?token=<signed token>[&scope=marketing]   (link in every email)
// GET shows a confirm button: link scanners and prefetchers follow GET links, so a GET
// must never unsubscribe. POST unsubscribes; that covers the button and RFC 8058
// one-click unsubscribe, which mail clients send as a POST with
// "List-Unsubscribe=One-Click". The signed token is the credential (no login needed).
import {
  escapeHtml,
  type UnsubscribeScope,
  verifyUnsubscribeToken,
} from "@studypulse/core/notify/index.ts";

import { env } from "../_shared/env.ts";
import { createHandler } from "../_shared/handler.ts";
import { requireMethod } from "../_shared/http.ts";
import { adminClient } from "../_shared/supabase.ts";

function page(status: number, title: string, body: string): Response {
  const html =
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head>` +
    `<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#1b2230">` +
    `<h1 style="font-size:22px">${escapeHtml(title)}</h1>${body}</body></html>`;
  return new Response(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
    },
  });
}

const invalid = () =>
  page(
    400,
    "This link has expired",
    "<p>Turn off email digests in StudyPulse under Settings → Notifications.</p>",
  );

Deno.serve(
  createHandler("email-unsubscribe", async (req) => {
    requireMethod(req, "GET", "POST");
    const secret = env().EMAIL_UNSUBSCRIBE_SECRET;
    const params = new URL(req.url).searchParams;
    const token = params.get("token") ?? "";
    // Marketing and digest links are signed for their own scope (S15).
    const scope: UnsubscribeScope = params.get("scope") === "marketing" ? "marketing" : "digest";
    const userId =
      secret && token.length <= 200 ? await verifyUnsubscribeToken(token, secret, scope) : null;
    if (!userId) return invalid();
    const what = scope === "marketing" ? "StudyPulse news and tips" : "email digests";

    if (req.method === "GET") {
      const scopeParam = scope === "marketing" ? "&scope=marketing" : "";
      return page(
        200,
        `Unsubscribe from ${what}?`,
        `<p>You'll stop getting ${escapeHtml(what)} by email. You can turn it back on in Settings → Notifications.</p>` +
          `<form method="post" action="?token=${encodeURIComponent(token)}${scopeParam}">` +
          `<button type="submit" style="background:#0f7466;color:#fff;border:0;padding:10px 16px;border-radius:6px;font-size:15px">Unsubscribe</button>` +
          `</form>`,
      );
    }

    // Takes effect immediately: the senders read the preference right before each send.
    const { error } = await adminClient().rpc(
      scope === "marketing" ? "unsubscribe_marketing" : "unsubscribe_email_digest",
      { p_user_id: userId },
    );
    if (error) throw error;
    return page(
      200,
      "You're unsubscribed",
      `<p>You won't get ${escapeHtml(what)} anymore. Turn it back on anytime in Settings → Notifications.</p>`,
    );
  }),
);
