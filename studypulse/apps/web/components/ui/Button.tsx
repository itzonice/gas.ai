import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { Icon, type IconName } from "./icons";
import styles from "./ui.module.css";

export type ButtonVariant = "filled" | "tonal" | "text" | "danger";

interface Common {
  variant?: ButtonVariant;
  icon?: IconName;
  children: ReactNode;
}

/** A button, or a link styled as one when `href` is set. 48 px minimum target. */
export function Button({
  variant = "filled",
  icon,
  children,
  href,
  className,
  ...props
}: Common & { href?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = [styles.button, styles[variant], className].filter(Boolean).join(" ");
  const content = (
    <>
      {icon ? <Icon name={icon} size={20} /> : null}
      <span>{children}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...props}>
      {content}
    </button>
  );
}
