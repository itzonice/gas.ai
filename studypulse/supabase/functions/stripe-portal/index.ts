// POST /stripe-portal  ->  { "url": "https://billing.stripe.com/..." }
// Opens the Stripe customer portal (update card, cancel, invoices) for users who have
// bought on the web. 404 if the user has never checked out with Stripe.
import { createPortalSession } from "@studypulse/core/billing/index.ts";

import { appUrl, findStripeCustomer, stripeOptions } from "../_shared/billing.ts";
import { createHandler } from "../_shared/handler.ts";
import { HttpError, json, requireMethod } from "../_shared/http.ts";
import { adminClient, requireUser } from "../_shared/supabase.ts";

Deno.serve(
  createHandler("stripe-portal", async (req) => {
    requireMethod(req, "POST");
    const user = await requireUser(req);
    const options = stripeOptions();
    const customerId = await findStripeCustomer(adminClient(), user.id);
    if (!customerId) {
      throw new HttpError(404, "no_billing_account", "No web subscription to manage");
    }
    const url = await createPortalSession(
      { customerId, returnUrl: `${appUrl()}/settings/billing` },
      options,
    );
    return json({ url });
  }),
);
