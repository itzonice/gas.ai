import type { ReactNode } from "react";

import { Button } from "./Button";
import { Icon, type IconName } from "./icons";
import styles from "./ui.module.css";

/** What to show when a list has nothing yet, and the one thing to do about it. */
export function EmptyState({
  icon = "inbox",
  title,
  children,
  action,
  headingLevel = 2,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: { label: string; href?: string; onClick?: () => void; icon?: IconName };
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className={styles.emptyState}>
      <Icon name={icon} size={40} className={styles.emptyIcon} />
      <Heading className={styles.emptyTitle}>{title}</Heading>
      {children ? <p className={styles.emptyBody}>{children}</p> : null}
      {action ? (
        <Button
          variant="tonal"
          {...(action.icon ? { icon: action.icon } : {})}
          {...(action.href ? { href: action.href } : {})}
          {...(action.onClick ? { onClick: action.onClick } : {})}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
