// Offline on the phone (launch audit L2). Reads of the main screens are saved as they
// arrive and shown from the saved copy when there's no connection; writes (timer
// sessions, done checkboxes, scores) made offline wait in an outbox and are sent in
// order when the connection is back. A banner says which of those is happening. The
// rules and the airplane-mode test are in @studypulse/core/screens (offline.ts).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isNetworkError } from "@studypulse/core/api";
import {
  CACHE_PREFIX,
  enqueue,
  flushOutbox,
  OUTBOX_KEY,
  parseCache,
  parseOutbox,
  serializeCache,
  type OutboxEntry,
  type OutboxOp,
} from "@studypulse/core/screens";
import { useSyncExternalStore } from "react";
import { AppState } from "react-native";
import type { z } from "zod";

import { errorMessage } from "./errors";
import { getApi } from "./supabase";

export interface OfflineState {
  offline: boolean;
  /** When the data on screen was saved, if it came from the saved copy. */
  savedAt: number | null;
  /** Writes waiting to be sent. */
  pending: number;
  /** A queued write the server refused once it was sent (shown once). */
  refused: string | null;
}

let state: OfflineState = { offline: false, savedAt: null, pending: 0, refused: null };
const listeners = new Set<() => void>();

function update(patch: Partial<OfflineState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function useOffline(): OfflineState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

/** Offline, or with changes still waiting to sync. */
export function offlineNow(): boolean {
  return state.offline || state.pending > 0;
}

export function dismissRefused() {
  update({ refused: null });
}

/**
 * Loads a screen's data, saving a copy; offline, shows the saved copy (checked against
 * the schema) instead. Other errors are thrown as usual.
 */
export async function cached<S extends z.ZodType>(
  name: string,
  schema: S,
  fetcher: () => Promise<z.output<S>>,
): Promise<z.output<S>> {
  const key = `${CACHE_PREFIX}${name}`;
  try {
    const data = await fetcher();
    AsyncStorage.setItem(key, serializeCache(data)).catch(() => undefined);
    if (state.offline || state.savedAt !== null) update({ offline: false, savedAt: null });
    void flush();
    return data;
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const hit = parseCache(await AsyncStorage.getItem(key).catch(() => null), schema);
    update({ offline: true, savedAt: hit?.savedAt ?? null });
    if (hit) return hit.data;
    throw error;
  }
}

// ---------------------------------------------------------------------------- outbox

let outbox: OutboxEntry[] | null = null;

async function loadOutbox(): Promise<OutboxEntry[]> {
  if (!outbox) {
    outbox = parseOutbox(await AsyncStorage.getItem(OUTBOX_KEY).catch(() => null));
    update({ pending: outbox.length });
  }
  return outbox;
}

async function saveOutbox(list: OutboxEntry[]) {
  outbox = list;
  update({ pending: list.length });
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(list)).catch(() => undefined);
}

async function send(op: OutboxOp): Promise<void> {
  const api = getApi();
  switch (op.kind) {
    case "session.start":
      await api.sessions.start({
        id: op.id,
        courseId: op.courseId,
        ...(op.assignmentId ? { assignmentId: op.assignmentId } : {}),
        startedAt: op.startedAt,
      });
      return;
    case "session.stop":
      await api.sessions.stop({ id: op.id, endedAt: op.endedAt });
      return;
    case "assignment.status":
      await api.assignments.update({ id: op.id, status: op.status });
      return;
    case "assignment.score":
      await api.assignments.update({
        id: op.id,
        pointsEarned: op.pointsEarned,
        pointsPossible: op.pointsPossible,
        status: "done",
      });
      return;
    case "block.status":
      await api.plan.setBlockStatus({ id: op.id, status: op.status });
      return;
  }
}

// Writes and flushes run one at a time, so the outbox keeps the order changes were made.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}

/**
 * Saves a change: sent now when possible, otherwise queued (and shown as synced later).
 * Anything already waiting goes first, so changes reach the server in order. Errors
 * other than a lost connection are thrown, as before.
 */
export function write(op: OutboxOp): Promise<"sent" | "queued"> {
  return exclusive(async () => {
    const list = await loadOutbox();
    if (list.length === 0) {
      try {
        await send(op);
        return "sent" as const;
      } catch (error) {
        if (!isNetworkError(error)) throw error;
      }
    }
    await saveOutbox(enqueue(list, op));
    update({ offline: true });
    void flush();
    return "queued" as const;
  });
}

/** Sends what's waiting. Safe to call often. */
export function flush(): Promise<void> {
  return exclusive(async () => {
    const list = await loadOutbox();
    if (list.length === 0) return;
    const result = await flushOutbox(list, send, isNetworkError);
    await saveOutbox(result.remaining);
    if (result.remaining.length === 0 && state.offline && state.savedAt === null) {
      update({ offline: false });
    }
    const first = result.refused[0];
    if (first) {
      update({
        refused:
          result.refused.length === 1
            ? `A change made offline couldn't be saved: ${errorMessage(first.error)}`
            : `${String(result.refused.length)} changes made offline couldn't be saved.`,
      });
    }
  });
}

/** Forgets everything in memory (signed out; the stored copies are cleared separately). */
export function resetOffline() {
  outbox = [];
  update({ offline: false, savedAt: null, pending: 0, refused: null });
}

// Try again when the app comes back to the front, and every 20 s while changes wait.
AppState.addEventListener("change", (s) => {
  if (s === "active") void flush();
});
setInterval(() => {
  if (state.pending > 0 && AppState.currentState === "active") void flush();
}, 20_000);
void loadOutbox();
