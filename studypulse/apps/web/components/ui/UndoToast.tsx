"use client";

// Deletes with Undo instead of a confirmation (launch audit L3). useUndoDelete hides the
// row at once and shows this toast; the delete runs when the window closes (10 s, paused
// while the toast is hovered or focused), when the page is hidden, or when the screen
// unmounts. The toast is a polite live region, so screen readers hear "Deleted …" once.
import { createUndoQueue, type PendingDelete, type UndoQueue } from "@studypulse/core/screens";
import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./ui.module.css";

export function useUndoDelete(options: {
  /** The delete failed after the window closed; the row is already back on screen. */
  onError: (item: PendingDelete, error: unknown) => void;
  onCommitted?: (item: PendingDelete) => void;
}) {
  const [pending, setPending] = useState<PendingDelete | null>(null);
  // Rows deleted on this screen: hidden at once; shown again on Undo or a failed delete.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const handlers = useRef(options);
  useEffect(() => {
    handlers.current = options;
  });
  // The ref is read inside the queue's callbacks only, never while rendering.
  // eslint-disable-next-line react-hooks/refs
  const [queue] = useState<UndoQueue>(() =>
    createUndoQueue({
      onChange: setPending,
      onError: (item, error) => {
        setHidden((h) => without(h, item.id));
        handlers.current.onError(item, error);
      },
      onCommitted: (item) => {
        handlers.current.onCommitted?.(item);
      },
    }),
  );

  useEffect(() => {
    // Leaving the page or closing the tab: finish the delete rather than lose it.
    const onHide = () => void queue.flush();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      void queue.flush();
    };
  }, [queue]);

  const remove = useCallback(
    (item: PendingDelete, commit: () => Promise<void>) => {
      setHidden((h) => new Set(h).add(item.id));
      queue.schedule(item, commit);
    },
    [queue],
  );
  const undo = useCallback(
    (id: string) => {
      if (queue.undo(id)) setHidden((h) => without(h, id));
    },
    [queue],
  );

  const toast = <UndoToast pending={pending} queue={queue} onUndo={undo} />;
  return { remove, undo, hidden, pending, toast };
}

function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

function UndoToast({
  pending,
  queue,
  onUndo,
}: {
  pending: PendingDelete | null;
  queue: UndoQueue;
  onUndo: (id: string) => void;
}) {
  return (
    <div
      role="status"
      className={styles.toastRegion}
      onMouseEnter={() => queue.hold(true)}
      onMouseLeave={() => queue.hold(false)}
      onFocus={() => queue.hold(true)}
      onBlur={() => queue.hold(false)}
    >
      {pending ? (
        <div className={styles.toast}>
          <span>{pending.label}</span>
          <button
            type="button"
            className={styles.toastAction}
            onClick={() => {
              queue.hold(false);
              onUndo(pending.id);
            }}
          >
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}
