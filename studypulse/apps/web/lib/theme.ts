// Light, dark, or follow the system. The choice lives in this browser (localStorage) and
// is applied as <html data-theme>, which tokens.css reads. An inline script in the root
// layout applies it before first paint, so there is no flash of the wrong theme.
import { useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";

import { THEME_KEY } from "./theme-boot";

const EVENT = "sp-theme-change";

function read(): ThemeChoice {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked (private window): the choice still applies until reload.
  }
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  window.dispatchEvent(new Event(EVENT));
}

/** The system dark-mode query, or null where the browser has none. */
const media = (): MediaQueryList | null =>
  typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  const m = media();
  m?.addEventListener("change", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
    m?.removeEventListener("change", cb);
  };
}

/** The saved choice ("system" on the server). */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, read, () => "system");
}

/** The theme actually showing: the choice, or the system's when following it. */
export function useResolvedTheme(): "light" | "dark" | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      const c = read();
      if (c !== "system") return c;
      return media()?.matches ? "dark" : "light";
    },
    () => null,
  );
}
