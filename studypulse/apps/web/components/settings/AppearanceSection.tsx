"use client";

// Settings > Appearance: light, dark, or match the device. Saved in this browser and
// applied at once (no Save needed).
import { setTheme, useThemeChoice, type ThemeChoice } from "@/lib/theme";

import styles from "./settings.module.css";

const OPTIONS: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: "system", label: "Match my device", hint: "Follows your system setting." },
  { value: "light", label: "Light", hint: "Paper white." },
  { value: "dark", label: "Dark", hint: "Deep navy, easy on the eyes at night." },
];

export function AppearanceSection() {
  const choice = useThemeChoice();
  return (
    <section className={styles.section} aria-labelledby="appearance-heading">
      <h2 id="appearance-heading" className={styles.sectionHeading}>
        Appearance
      </h2>
      <fieldset className={styles.themeOptions}>
        <legend className={styles.muted}>Theme. Changes right away on this device.</legend>
        {OPTIONS.map((o) => (
          <label key={o.value} className={styles.themeOption}>
            <input
              type="radio"
              name="theme"
              value={o.value}
              checked={choice === o.value}
              onChange={() => {
                setTheme(o.value);
              }}
            />
            <span>
              <span className={styles.themeLabel}>{o.label}</span>
              <span className={styles.muted}>{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
