"use client";

// A clear sign when the browser is offline (launch audit L2). The web app needs the
// network to save; the phone apps queue changes and sync them later.
import { useSyncExternalStore } from "react";

import { Icon } from "../ui/icons";
import styles from "./shell.module.css";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

export function OfflineBanner() {
  const online = useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
  return (
    <div role="status" className={online ? undefined : styles.offline}>
      {online ? null : (
        <>
          <Icon name="warning" size={20} />
          You&apos;re offline. Changes won&apos;t be saved until you&apos;re back online.
        </>
      )}
    </div>
  );
}
