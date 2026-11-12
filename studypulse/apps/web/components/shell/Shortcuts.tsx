"use client";

// App-wide keyboard shortcuts (launch audit L5): "g" then a letter for each destination,
// "f" to start focus, "u" to upload a syllabus, "?" for the list. The list is also one
// click away in the navigation, and it has the switch that turns shortcuts off (WCAG
// 2.1.4). Keys are ignored while typing, with Ctrl/Alt/Cmd, or when a dialog is open.
import {
  describeKeys,
  matchShortcut,
  SEQUENCE_TIMEOUT_MS,
  SHORTCUTS,
  SHORTCUTS_KEY,
} from "@studypulse/core/screens";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button, CheckboxField, Dialog } from "../ui";
import { Icon } from "../ui/icons";
import styles from "./shell.module.css";

function readEnabled(): boolean {
  try {
    return window.localStorage.getItem(SHORTCUTS_KEY) !== "off";
  } catch {
    return true;
  }
}

function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.closest("[role='textbox'], [role='combobox'], [role='listbox']") !== null
  );
}

export function Shortcuts() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const pending = useRef<string[]>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read this browser's choice once
    setEnabled(readEnabled());
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (typingIn(e.target) || document.querySelector("dialog[open]")) return;
      if (e.key.length !== 1) return;
      const result = matchShortcut(pending.current, e.key);
      pending.current = result.pending;
      window.clearTimeout(timer.current);
      if (result.pending.length) {
        timer.current = window.setTimeout(() => {
          pending.current = [];
        }, SEQUENCE_TIMEOUT_MS);
      }
      if (!result.match) return;
      e.preventDefault();
      if ("help" in result.match.action) setOpen(true);
      else router.push(result.match.action.href);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.clearTimeout(timer.current);
    };
  }, [enabled, router]);

  function changeEnabled(next: boolean) {
    setEnabled(next);
    try {
      if (next) window.localStorage.removeItem(SHORTCUTS_KEY);
      else window.localStorage.setItem(SHORTCUTS_KEY, "off");
    } catch {
      // Storage blocked: the choice lasts until the page is reloaded.
    }
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.navLink} ${styles.shortcutsButton}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        <span className={styles.navIndicator}>
          <Icon name="keyboard" />
        </span>
        <span className={styles.navLabel}>Shortcuts</span>
      </button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Keyboard shortcuts"
        labelledBy="shortcuts-title"
        footer={
          <Button
            variant="filled"
            onClick={() => {
              setOpen(false);
            }}
          >
            Done
          </Button>
        }
      >
        <table className={styles.shortcutTable}>
          <caption className={styles.visuallyHidden}>Keyboard shortcuts</caption>
          <thead>
            <tr>
              <th scope="col">Keys</th>
              <th scope="col">Does</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.keys.join(" ")}>
                <td>
                  <span className={styles.visuallyHidden}>{describeKeys(s.keys)}</span>
                  <span aria-hidden="true">
                    {s.keys.map((k, i) => (
                      <span key={i}>
                        {i > 0 ? " then " : null}
                        <kbd className={styles.kbd}>{k}</kbd>
                      </span>
                    ))}
                  </span>
                </td>
                <td>{s.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <CheckboxField
          label="Use keyboard shortcuts"
          hint="They only work when you're not typing in a field."
          checked={enabled}
          onChange={(e) => {
            changeEnabled(e.currentTarget.checked);
          }}
        />
      </Dialog>
    </>
  );
}
