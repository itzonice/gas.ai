// Checks Expo push receipts for recent sends and invalidates tokens the push service
// says are dead (DeviceNotRegistered). Run from the notification cron.
import { getExpoReceipts, isDeadToken } from "@studypulse/core/notify/index.ts";
import type { Logger } from "@studypulse/core/observability/index.ts";

import { expoOptions } from "./options.ts";
import type { AdminClient } from "../supabase.ts";
import { chunks } from "../chunks.ts";

export async function checkExpoReceipts(
  db: AdminClient,
  log: Logger,
  fetchImpl?: typeof fetch,
): Promise<{ checked: number; invalidated: number }> {
  const now = Date.now();
  const { data: rows, error } = await db
    .from("notification_log")
    .select("id, token_id, provider_message_id")
    .eq("channel", "expo")
    .eq("status", "sent")
    .not("provider_message_id", "is", null)
    .is("receipt_checked_at", null)
    .lt("created_at", new Date(now - 15 * 60_000).toISOString())
    .gt("created_at", new Date(now - 24 * 3_600_000).toISOString())
    .limit(1000);
  if (error) throw error;
  if (!rows.length) return { checked: 0, invalidated: 0 };

  const receipts = await getExpoReceipts(
    rows.map((r) => r.provider_message_id ?? ""),
    { ...expoOptions(), ...(fetchImpl ? { fetch: fetchImpl } : {}) },
  );
  const dead = rows.filter((r) => {
    const receipt = receipts[r.provider_message_id ?? ""];
    return receipt !== undefined && isDeadToken(receipt) && r.token_id !== null;
  });
  const failed = rows
    .filter((r) => receipts[r.provider_message_id ?? ""]?.status === "error")
    .map((r) => r.id);

  if (dead.length) {
    const { error: invalidateError } = await db.rpc("invalidate_push_tokens", {
      p_token_ids: dead.map((r) => r.token_id ?? ""),
    });
    if (invalidateError) throw invalidateError;
  }
  for (const ids of chunks(failed)) {
    await db
      .from("notification_log")
      .update({ status: "failed", error: "push receipt error" })
      .in("id", ids);
  }
  // Receipts not ready yet stay unchecked and are retried next run (up to 24 h).
  const ready = rows
    .filter((r) => receipts[r.provider_message_id ?? ""] !== undefined)
    .map((r) => r.id);
  const checkedAt = new Date().toISOString();
  for (const ids of chunks(ready)) {
    await db.from("notification_log").update({ receipt_checked_at: checkedAt }).in("id", ids);
  }
  log.info("push receipts checked", {
    checked: ready.length,
    invalidated: dead.length,
    failed: failed.length,
  });
  return { checked: ready.length, invalidated: dead.length };
}
