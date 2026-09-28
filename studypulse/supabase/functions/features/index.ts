// GET /features
// Which optional features this deployment has turned on, so the apps can show them as
// unavailable instead of failing: { "features": { "stripe": false, ... } }. Only on/off
// flags; never variable names or values. No auth needed.
import { featureFlags } from "@studypulse/core/env/index.ts";

import { createHandler } from "../_shared/handler.ts";
import { json, requireMethod } from "../_shared/http.ts";

Deno.serve(
  createHandler("features", (req) => {
    requireMethod(req, "GET");
    const features = featureFlags(Deno.env.toObject(), [
      "ai",
      "stripe",
      "revenuecat",
      "email",
      "webPush",
      "googleCalendar",
    ]);
    return json({ features }, { headers: { "Cache-Control": "public, max-age=60" } });
  }),
);
