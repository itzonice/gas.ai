"use client";

// App bar button: switch between light and dark. Settings > Appearance also offers
// "Match my device".
import { setTheme, useResolvedTheme } from "@/lib/theme";

import { Icon } from "../ui/icons";
import styles from "./shell.module.css";

export function ThemeToggle() {
  const theme = useResolvedTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label="Dark mode"
      aria-pressed={theme === null ? undefined : dark}
      onClick={() => {
        setTheme(dark ? "light" : "dark");
      }}
    >
      <Icon name={dark ? "lightMode" : "darkMode"} />
    </button>
  );
}
