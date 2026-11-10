"use client";

// Loads data when a screen opens and again on request, with the three states every
// screen shows: loading, an error with "Try again", and ready. `fetcher` must be stable
// (wrap it in useCallback), or it will load on every render.
import { ApiError } from "@studypulse/core/api";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { Button, EmptyState, Icon } from "@/components/ui";

import styles from "./study.module.css";

export type Load<T> =
  | { status: "loading" }
  | { status: "error"; message: string; notFound: boolean }
  | { status: "ready"; data: T };

export function useLoad<T>(fetcher: () => Promise<T>) {
  const [state, setState] = useState<Load<T>>({ status: "loading" });

  const refresh = useCallback(async () => {
    try {
      setState({ status: "ready", data: await fetcher() });
    } catch (e) {
      setState({
        status: "error",
        message: e instanceof Error ? e.message : "Something went wrong.",
        notFound: e instanceof ApiError && e.status === 404,
      });
    }
  }, [fetcher]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    void refresh();
  }, [refresh]);

  /** Replaces the loaded data without fetching (after an edit the screen already knows). */
  const update = useCallback((change: (data: T) => T) => {
    setState((s) => (s.status === "ready" ? { status: "ready", data: change(s.data) } : s));
  }, []);

  return { state, refresh, update };
}

/** The loading and error states of a load, or `children` once there is data. */
export function LoadGate<T>({
  state,
  what,
  onRetry,
  notFound,
  children,
}: {
  state: Load<T>;
  /** "your study sets", for "Loading your study sets…". */
  what: string;
  onRetry: () => void;
  /** Shown instead of the error when the thing doesn't exist (or isn't yours). */
  notFound?: { title: string; backHref: string; backLabel: string };
  children: (data: T) => ReactNode;
}) {
  if (state.status === "loading") {
    return (
      <p role="status" className={styles.note}>
        Loading {what}…
      </p>
    );
  }
  if (state.status === "error") {
    if (state.notFound && notFound) {
      return (
        <EmptyState
          icon="warning"
          title={notFound.title}
          action={{ label: notFound.backLabel, href: notFound.backHref }}
        >
          It may have been deleted, or it belongs to another account.
        </EmptyState>
      );
    }
    return (
      <p role="alert" className={styles.alert}>
        <Icon name="warning" size={20} />
        Couldn&apos;t load {what}: {state.message}
        <Button variant="text" onClick={onRetry}>
          Try again
        </Button>
      </p>
    );
  }
  return <>{children(state.data)}</>;
}
