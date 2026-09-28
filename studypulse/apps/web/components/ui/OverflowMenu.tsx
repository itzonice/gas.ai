"use client";

// Overflow ("more actions") menu, following the WAI-ARIA menu button pattern:
// - Enter, Space, or ArrowDown on the button opens the menu and focuses the first item;
//   ArrowUp opens it on the last item.
// - ArrowUp/ArrowDown move between items (wrapping), Home/End jump to the ends.
// - Escape closes and returns focus to the button; Tab or a click outside closes.
import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import { Icon } from "./icons";
import styles from "./ui.module.css";

export type MenuItem =
  | { label: string; onSelect: () => void; destructive?: boolean }
  | { label: string; href: string; destructive?: boolean };

export function OverflowMenu({ label, items }: { label: string; items: readonly MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<"first" | "last" | null>(null);
  const menuId = useId();

  const itemEls = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  const openMenu = (focus: "first" | "last") => {
    pendingFocus.current = focus;
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const els = itemEls();
    const target = pendingFocus.current === "last" ? els.at(-1) : els[0];
    target?.focus();
    pendingFocus.current = null;

    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openMenu("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openMenu("last");
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    const els = itemEls();
    const i = els.indexOf(document.activeElement as HTMLElement);
    const focusAt = (n: number) => els[(n + els.length) % els.length]?.focus();
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        focusAt(i + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        focusAt(i - 1);
        break;
      case "Home":
        e.preventDefault();
        focusAt(0);
        break;
      case "End":
        e.preventDefault();
        focusAt(els.length - 1);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        close(false);
        break;
    }
  };

  return (
    <div className={styles.menuWrap} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.iconButton}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (open) close(false);
          else openMenu("first");
        }}
        onKeyDown={onButtonKeyDown}
      >
        <Icon name="more" />
      </button>
      {open ? (
        <ul
          id={menuId}
          role="menu"
          aria-label={label}
          className={styles.menu}
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item) => {
            const cls = [styles.menuItem, item.destructive ? styles.menuItemDestructive : ""].join(
              " ",
            );
            return (
              <li key={item.label} role="none">
                {"href" in item ? (
                  <Link
                    role="menuitem"
                    tabIndex={-1}
                    href={item.href}
                    className={cls}
                    onClick={() => close(false)}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button
                    role="menuitem"
                    tabIndex={-1}
                    type="button"
                    className={cls}
                    onClick={() => {
                      close(true);
                      item.onSelect();
                    }}
                  >
                    {item.label}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
