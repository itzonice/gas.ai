import type { AdminClient } from "./supabase.ts";

/** Deletes every object under `{userId}/` in a bucket. Returns how many were removed. */
export async function removeUserFolder(
  db: AdminClient,
  bucket: string,
  userId: string,
): Promise<number> {
  let removed = 0;
  // Files live directly in the user's folder; list and delete in pages until empty.
  for (;;) {
    const { data, error } = await db.storage.from(bucket).list(userId, { limit: 100 });
    if (error) throw error;
    const paths = (data ?? []).filter((o) => o.id !== null).map((o) => `${userId}/${o.name}`);
    if (paths.length === 0) return removed;
    const { error: removeError } = await db.storage.from(bucket).remove(paths);
    if (removeError) throw removeError;
    removed += paths.length;
  }
}
