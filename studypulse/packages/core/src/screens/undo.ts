// Deletes with an undo window instead of an "Are you sure?" dialog (launch audit L3).
// The row disappears at once and a toast offers Undo; the real delete runs only when the
// window closes, when another delete replaces the toast, or when the screen goes away
// (flush). Undo just cancels the timer, so nothing is ever deleted and restored.
// Shared by web and mobile; the timer functions are injectable for tests.

export interface PendingDelete {
  id: string;
  /** What the toast says, e.g. `Deleted "Lab 3".` */
  label: string;
}

export interface UndoQueue {
  /** Starts the undo window for a delete. An earlier pending delete is committed now. */
  schedule(item: PendingDelete, commit: () => Promise<void>): void;
  /** Cancels the pending delete. Returns false if it already ran (or never existed). */
  undo(id: string): boolean;
  /** Runs any pending delete right away (screen closing, page hidden). */
  flush(): Promise<void>;
  /** Pauses or resumes the countdown (toast hovered or focused; WCAG 2.2.1). */
  hold(held: boolean): void;
  pending(): PendingDelete | null;
}

export const UNDO_WINDOW_MS = 10_000;

export function createUndoQueue(options: {
  onChange: (pending: PendingDelete | null) => void;
  /** A delete failed after the window closed: say so and put the row back. */
  onError: (item: PendingDelete, error: unknown) => void;
  /** Called after a delete succeeds (refresh the list). */
  onCommitted?: (item: PendingDelete) => void;
  windowMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}): UndoQueue {
  const windowMs = options.windowMs ?? UNDO_WINDOW_MS;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer =
    options.clearTimer ??
    ((h) => {
      clearTimeout(h as ReturnType<typeof setTimeout>);
    });
  let current: { item: PendingDelete; commit: () => Promise<void> } | null = null;
  let timer: unknown = null;
  let startedAt = 0;
  let remaining = windowMs;
  let held = false;

  const stopTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };
  const startTimer = () => {
    stopTimer();
    startedAt = Date.now();
    timer = setTimer(() => void run(), remaining);
  };

  async function run() {
    const entry = current;
    stopTimer();
    if (!entry) return;
    current = null;
    options.onChange(null);
    try {
      await entry.commit();
      options.onCommitted?.(entry.item);
    } catch (error) {
      options.onError(entry.item, error);
    }
  }

  return {
    schedule(item, commit) {
      if (current) void run();
      current = { item, commit };
      remaining = windowMs;
      options.onChange(item);
      if (!held) startTimer();
    },
    undo(id) {
      if (current?.item.id !== id) return false;
      stopTimer();
      current = null;
      options.onChange(null);
      return true;
    },
    flush: run,
    hold(next) {
      if (next === held) return;
      held = next;
      if (!current) return;
      if (held) {
        remaining = Math.max(0, remaining - (Date.now() - startedAt));
        stopTimer();
      } else {
        // At least a couple of seconds after the pointer or focus leaves.
        remaining = Math.max(remaining, 2_000);
        startTimer();
      }
    },
    pending: () => current?.item ?? null,
  };
}
