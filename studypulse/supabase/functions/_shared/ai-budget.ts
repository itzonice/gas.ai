// Launch safety S7: checks the user's daily AI spend cap right before an AI call. New
// uploads and card generations are already refused at insert (trigger); this also stops
// work that was queued before the cap was reached, and an OCR pass from pushing the
// parse that follows it over the limit.
import { z } from "zod";

import type { AdminClient } from "./supabase.ts";

const statusSchema = z.object({
  spent_cents: z.coerce.number(),
  cap_cents: z.coerce.number(),
  exceeded: z.boolean(),
});
export type AiBudget = z.infer<typeof statusSchema>;

export const AI_BUDGET_MESSAGE =
  "You've reached today's limit for AI features. It resets at midnight.";

export async function aiBudget(db: AdminClient, userId: string): Promise<AiBudget> {
  const { data, error } = await db.rpc("ai_budget_status", { p_user_id: userId });
  if (error) throw error;
  return statusSchema.parse(data);
}
