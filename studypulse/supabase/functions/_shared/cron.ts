import { env } from "./env.ts";
import { HttpError } from "./http.ts";

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

/** Scheduled functions accept only calls carrying the shared cron secret. */
export function requireCron(req: Request): void {
  const secret = env().CRON_SECRET;
  const given = req.headers.get("x-cron-secret") ?? "";
  if (!secret || !given || !safeEqual(given, secret)) {
    throw new HttpError(401, "unauthorized", "Missing or invalid cron secret");
  }
}
