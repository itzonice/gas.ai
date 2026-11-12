// A row that can be swiped sideways for a quick action. Swiping is only a shortcut:
// every swipe action is also a button in the row (the checkbox or the overflow menu) and
// an accessibility action, so VoiceOver, TalkBack, switch control, and anyone who can't
// swipe get the same result. With "reduce motion" on, the row doesn't spring back.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Text, View } from "react-native";

import { useReduceMotion } from "../../lib/hooks";
import { useAppTheme } from "../../theme";
import { Icon, type IconName } from "./Icon";

export interface SwipeAction {
  label: string;
  icon: IconName;
  onAction: () => void;
}

const TRIGGER = 96;

export function SwipeRow({
  children,
  right,
  left,
}: {
  children: ReactNode;
  /** Revealed by swiping right (e.g. "Mark done"). */
  right?: SwipeAction;
  /** Revealed by swiping left (e.g. "Skip"). */
  left?: SwipeAction;
}) {
  const theme = useAppTheme();
  const reduceMotion = useReduceMotion();
  const [x] = useState(() => new Animated.Value(0));
  const actions = useRef({ right, left, reduceMotion });
  useEffect(() => {
    actions.current = { right, left, reduceMotion };
  }, [right, left, reduceMotion]);

  const pan = useMemo(
    () =>
      // The ref is read inside gesture callbacks only, never while rendering.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        // Only clearly sideways drags; vertical scrolling stays with the list.
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderMove: (_, g) => {
          const { right: r, left: l } = actions.current;
          if ((g.dx > 0 && r) || (g.dx < 0 && l)) x.setValue(g.dx);
        },
        onPanResponderRelease: (_, g) => {
          const { right: r, left: l, reduceMotion: still } = actions.current;
          if (g.dx >= TRIGGER && r) r.onAction();
          else if (g.dx <= -TRIGGER && l) l.onAction();
          if (still) x.setValue(0);
          else Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => {
          x.setValue(0);
        },
      }),
    [x],
  );

  const a11yActions = [right, left].filter((a): a is SwipeAction => Boolean(a));
  const hint = (action: SwipeAction | undefined, side: "flex-start" | "flex-end") =>
    action ? (
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          alignSelf: side,
          gap: theme.spacing.half,
          paddingHorizontal: theme.spacing.card,
        }}
      >
        <Icon name={action.icon} size={20} color={theme.colors.onSecondaryContainer} />
        <Text style={[theme.type.labelLarge, { color: theme.colors.onSecondaryContainer }]}>
          {action.label}
        </Text>
      </View>
    ) : null;

  return (
    <View
      accessibilityActions={a11yActions.map((a) => ({ name: a.label, label: a.label }))}
      onAccessibilityAction={(e) => {
        a11yActions.find((a) => a.label === e.nativeEvent.actionName)?.onAction();
      }}
      style={{ backgroundColor: theme.colors.secondaryContainer, overflow: "hidden" }}
    >
      <View
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {hint(right, "flex-start") ?? <View />}
        {hint(left, "flex-end")}
      </View>
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

/**
 * Sideways swipes on a whole area (e.g. the calendar's week) to page back and forward.
 * Always pair it with Previous and Next buttons; this is only a shortcut.
 */
export function useHorizontalSwipe(onPrevious: () => void, onNext: () => void) {
  const handlers = useRef({ onPrevious, onNext });
  useEffect(() => {
    handlers.current = { onPrevious, onNext };
  }, [onPrevious, onNext]);
  return useMemo(
    () =>
      // The ref is read inside gesture callbacks only, never while rendering.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
          Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_, g) => {
          if (g.dx >= TRIGGER) handlers.current.onPrevious();
          else if (g.dx <= -TRIGGER) handlers.current.onNext();
        },
      }).panHandlers,
    [],
  );
}
