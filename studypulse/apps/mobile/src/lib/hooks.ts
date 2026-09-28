// Small hooks shared by the tab screens: loading data when a screen comes into view,
// the system "reduce motion" setting, and the window size class.
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, useWindowDimensions } from "react-native";

import { errorMessage } from "./errors";

/**
 * Loads data each time the screen comes into view (so a tab shows fresh numbers after a
 * change elsewhere) and on pull to refresh. Pass a stable fetcher (useCallback). Data
 * already on screen stays there if a refresh fails; the error is shown beside it.
 * `failure` is the thrown value, for telling a 404 from a network error.
 */
export function useLoad<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const call = ++latest.current;
    try {
      const next = await fetcher();
      if (call !== latest.current) return;
      setData(next);
      setError(null);
      setFailure(null);
    } catch (e) {
      if (call !== latest.current) return;
      setError(errorMessage(e));
      setFailure(e);
    }
  }, [fetcher]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await reload();
    setRefreshing(false);
  }, [reload]);

  return { data, error, failure, refreshing, refresh, reload };
}

/** True when the student asked the system for less motion (iOS and Android). */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (on) => {
        if (live) setReduce(on);
      },
      () => undefined,
    );
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

export type WindowClass = "compact" | "medium" | "expanded";

/**
 * Material window size classes from the design tokens: phones are compact, tablets in
 * portrait medium, and tablets in landscape expanded.
 */
export function useWindowClass(): WindowClass {
  const { width } = useWindowDimensions();
  if (width >= 1024) return "expanded";
  if (width >= 600) return "medium";
  return "compact";
}

/** Reads a message out on VoiceOver and TalkBack (start, pause, finish, saved, failed). */
export function announce(message: string) {
  if (message) AccessibilityInfo.announceForAccessibility(message);
}
