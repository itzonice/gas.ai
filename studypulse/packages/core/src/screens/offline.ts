// Offline support (launch audit L2): an outbox of writes made without a connection, and
// saved copies of the main screens' data. Every queued write is idempotent (sessions
// carry the id the app made; status and score edits set a value), so sending one twice
// after a lost response is harmless. Device storage is untrusted: everything read back
// is parsed with zod first. Shared by the apps; the storage itself is theirs.
import { z } from "zod";

export const OUTBOX_KEY = "studypulse.outbox";
export const CACHE_PREFIX = "studypulse.cache.";
/** Saved screen data older than this isn't shown. */
export const CACHE_MAX_AGE_MS = 14 * 86_400_000;
/** The outbox keeps at most this many writes; the oldest status edits go first. */
export const OUTBOX_LIMIT = 500;

const uuid = z.uuid();
const iso = z.iso.datetime({ offset: true });

const opSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("session.start"),
    id: uuid,
    courseId: uuid,
    assignmentId: uuid.nullable(),
    startedAt: iso,
  }),
  z.object({ kind: z.literal("session.stop"), id: uuid, endedAt: iso }),
  z.object({
    kind: z.literal("assignment.status"),
    id: uuid,
    status: z.enum(["todo", "in_progress", "done", "skipped"]),
  }),
  z.object({
    kind: z.literal("assignment.score"),
    id: uuid,
    pointsEarned: z.number().min(0),
    pointsPossible: z.number().positive(),
  }),
  z.object({
    kind: z.literal("block.status"),
    id: uuid,
    status: z.enum(["planned", "done", "missed"]),
  }),
]);
export type OutboxOp = z.infer<typeof opSchema>;

const entrySchema = z.object({ op: opSchema, queuedAt: z.number() });
export type OutboxEntry = z.infer<typeof entrySchema>;

/** The saved outbox; anything unreadable is dropped entry by entry, not all at once. */
export function parseOutbox(raw: string | null | undefined): OutboxEntry[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    const parsed = entrySchema.safeParse(v);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Adds a write. A later status or score edit of the same assignment (or block) replaces an
 * earlier one still waiting, so only the student's last choice is sent.
 */
export function enqueue(list: readonly OutboxEntry[], op: OutboxOp, now = Date.now()) {
  const replaces = (e: OutboxEntry) =>
    (op.kind === "assignment.status" ||
      op.kind === "assignment.score" ||
      op.kind === "block.status") &&
    e.op.kind === op.kind &&
    e.op.id === op.id;
  const next = [...list.filter((e) => !replaces(e)), { op, queuedAt: now }];
  return next.slice(-OUTBOX_LIMIT);
}

export interface FlushResult {
  remaining: OutboxEntry[];
  sent: number;
  /** Writes the server refused (not a network problem); they're dropped, not retried. */
  refused: { entry: OutboxEntry; error: unknown }[];
}

/**
 * Sends waiting writes in order. Stops at the first network failure and keeps the rest
 * for later (order matters: a session starts before it stops); a write the server refuses
 * is reported and dropped so it can't block everything behind it.
 */
export async function flushOutbox(
  list: readonly OutboxEntry[],
  send: (op: OutboxOp) => Promise<void>,
  isNetworkError: (error: unknown) => boolean,
): Promise<FlushResult> {
  const refused: FlushResult["refused"] = [];
  let sent = 0;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry) continue;
    try {
      await send(entry.op);
      sent++;
    } catch (error) {
      if (isNetworkError(error)) return { remaining: list.slice(i), sent, refused };
      refused.push({ entry, error });
    }
  }
  return { remaining: [], sent, refused };
}

/** A saved copy of a screen's data. */
export function serializeCache(data: unknown, now = Date.now()): string {
  return JSON.stringify({ v: 1, savedAt: now, data });
}

/** The saved copy if it's readable, fits the schema, and isn't too old. */
export function parseCache<S extends z.ZodType>(
  raw: string | null | undefined,
  schema: S,
  now = Date.now(),
): { data: z.output<S>; savedAt: number } | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const wrapper = z
    .object({ v: z.literal(1), savedAt: z.number(), data: z.unknown() })
    .safeParse(value);
  if (!wrapper.success) return null;
  const { savedAt, data } = wrapper.data;
  if (now - savedAt > CACHE_MAX_AGE_MS || savedAt > now + 60_000) return null;
  const parsed = schema.safeParse(data);
  return parsed.success ? { data: parsed.data, savedAt } : null;
}

/** "Offline. Showing what was saved at 3:05 PM." for the banner. */
export function offlineMessage(
  state: { savedAt: number | null; pending: number },
  timeZone?: string,
) {
  const parts = ["You're offline."];
  if (state.savedAt !== null) {
    const time = new Intl.DateTimeFormat("en-US", {
      ...(timeZone ? { timeZone } : {}),
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(state.savedAt));
    parts.push(`Showing what was saved at ${time}.`);
  }
  if (state.pending > 0) {
    parts.push(
      state.pending === 1
        ? "1 change will sync when you're back online."
        : `${String(state.pending)} changes will sync when you're back online.`,
    );
  }
  return parts.join(" ");
}
