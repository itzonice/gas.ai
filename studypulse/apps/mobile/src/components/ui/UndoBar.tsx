// Deletes with Undo instead of a confirmation (launch audit L3), the mobile twin of the
// web's useUndoDelete. The row is hidden at once and a bar offers Undo for 10 seconds
// (paused while a screen reader is focused on it); the delete runs when the window
// closes, when the app goes to the background, or when the screen closes.
import { createUndoQueue, type PendingDelete, type UndoQueue } from "@studypulse/core/screens";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Pressable, Text, View } from "react-native";

import { announce } from "../../lib/hooks";
import { useAppTheme } from "../../theme";

export function useUndoDelete(options: {
  /** The delete failed after the window closed; the row is already back on screen. */
  onError: (item: PendingDelete, error: unknown) => void;
  onCommitted?: (item: PendingDelete) => void;
  /** Room below the bar, e.g. to clear the floating "Start focus" button on tabs. */
  bottom?: number;
}) {
  const [pending, setPending] = useState<PendingDelete | null>(null);
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
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") void queue.flush();
    });
    return () => {
      sub.remove();
      void queue.flush();
    };
  }, [queue]);

  const remove = useCallback(
    (item: PendingDelete, commit: () => Promise<void>) => {
      setHidden((h) => new Set(h).add(item.id));
      queue.schedule(item, commit);
      announce(`${item.label} Undo is available.`);
    },
    [queue],
  );
  const undo = useCallback(
    (id: string) => {
      if (queue.undo(id)) {
        setHidden((h) => without(h, id));
        announce("Restored.");
      }
    },
    [queue],
  );

  const bar = (
    <UndoBar pending={pending} queue={queue} onUndo={undo} bottom={options.bottom ?? 0} />
  );
  return { remove, undo, hidden, pending, bar };
}

function without(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(set);
  next.delete(id);
  return next;
}

function UndoBar({
  pending,
  queue,
  onUndo,
  bottom,
}: {
  pending: PendingDelete | null;
  queue: UndoQueue;
  onUndo: (id: string) => void;
  bottom: number;
}) {
  const theme = useAppTheme();
  if (!pending) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        left: theme.spacing.card,
        right: theme.spacing.card,
        bottom: bottom + theme.spacing.card,
        maxWidth: 560,
        alignSelf: "center",
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        gap: theme.spacing.related,
        paddingLeft: theme.spacing.card,
        paddingRight: theme.spacing.related,
        paddingVertical: theme.spacing.half,
        borderRadius: theme.radii.control,
        backgroundColor: theme.colors.inverseSurface,
        elevation: 4,
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      <Text style={[theme.type.body, { color: theme.colors.inverseOnSurface, flexShrink: 1 }]}>
        {pending.label}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityHint="Puts it back"
        onPress={() => {
          queue.hold(false);
          onUndo(pending.id);
        }}
        onFocus={() => {
          queue.hold(true);
        }}
        onBlur={() => {
          queue.hold(false);
        }}
        style={{
          minHeight: 48,
          minWidth: 48,
          paddingHorizontal: theme.spacing.card,
          justifyContent: "center",
        }}
      >
        <Text style={[theme.type.labelLarge, { color: theme.colors.inversePrimary }]}>Undo</Text>
      </Pressable>
    </View>
  );
}
