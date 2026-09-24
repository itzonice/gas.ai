// /email-unsubscribe?token=<signed token>   (link in every digest email)
// GET shows a confirm button: link scanners and prefetchers follow GET links, so a GET
// must never unsubscribe. POST unsubscribes; that covers the button and RFC 8058
// one-click unsubscribe, which mail clients send as a POST with
// "List-Unsubscribe=One-Click". The signed token is the credential (no login needed).
import { verifyUnsubscribeToken, escapeHtml } from "@studypulse/core/notify/index.ts";

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
    const token = new URL(req.url).searchParams.get("token") ?? "";
    const userId =
      secret && token.length <= 200 ? await verifyUnsubscribeToken(token, secret) : null;
    if (!userId) return invalid();

    if (req.method === "GET") {
      return page(
        200,
        "Unsubscribe from email digests?",
        `<p>You'll stop getting the daily StudyPulse digest email. You can turn it back on in Settings → Notifications.</p>` +
          `<form method="post" action="?token=${encodeURIComponent(token)}">` +
          `<button type="submit" style="background:#0f7466;color:#fff;border:0;padding:10px 16px;border-radius:6px;font-size:15px">Unsubscribe</button>` +
          `</form>`,
      );
    }

    const { error } = await adminClient().rpc("unsubscribe_email_digest", { p_user_id: userId });
    if (error) throw error;
    return page(
      200,
      "You're unsubscribed",
      "<p>You won't get digest emails anymore. Turn them back on anytime in Settings → Notifications.</p>",
    );
  }),
);
