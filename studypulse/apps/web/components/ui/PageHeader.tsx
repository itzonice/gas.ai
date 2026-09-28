// Every screen's header: its one H1, an optional one-line description, the one primary
// action, and secondary actions in an overflow menu.
import type { ReactNode } from "react";

import { Button } from "./Button";
import type { IconName } from "./icons";
import { OverflowMenu, type MenuItem } from "./OverflowMenu";
import styles from "./ui.module.css";

export interface PrimaryAction {
  label: string;
  icon?: IconName;
  href?: string;
  onClick?: () => void;
}

export function PageHeader({
  title,
  description,
  primaryAction,
  secondaryActions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  primaryAction?: PrimaryAction;
  secondaryActions?: readonly MenuItem[];
  /** Extra content under the description (e.g. a filter row). */
  children?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <h1 className={styles.pageTitle}>{title}</h1>
        {description ? <p className={styles.pageDescription}>{description}</p> : null}
        {children}
      </div>
      {primaryAction || secondaryActions?.length ? (
        <div className={styles.pageActions}>
          {primaryAction ? (
            <Button
              variant="filled"
              {...(primaryAction.icon ? { icon: primaryAction.icon } : {})}
              {...(primaryAction.href ? { href: primaryAction.href } : {})}
              {...(primaryAction.onClick ? { onClick: primaryAction.onClick } : {})}
            >
              {primaryAction.label}
            </Button>
          ) : null}
          {secondaryActions?.length ? (
            <OverflowMenu label="More actions" items={secondaryActions} />
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
