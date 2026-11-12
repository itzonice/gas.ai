// GET /api/consent-region -> { required: boolean }
// Whether this visitor must opt in before optional processing runs (launch safety S23):
// from the host's geolocation header. No header (local dev, unknown) means required.
import { consentRequired } from "@studypulse/core/privacy";

export function GET(request: Request): Response {
  const country = request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry");
  return Response.json(
    { required: consentRequired(country) },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
