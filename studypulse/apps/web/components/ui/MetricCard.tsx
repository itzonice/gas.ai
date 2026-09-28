// A single figure with its label. `status` is shown as words plus an icon, never color
// alone (e.g. "At risk" on a grade).
import type { ReactNode } from "react";

import { Icon } from "./icons";
import styles from "./ui.module.css";

export function MetricCard({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  status?: { tone: "error"; text: string };
}) {
  return (
    <li className={styles.metricCard}>
      <span className={styles.metricLabel}>{label}</span>
      <span className={styles.metricValue}>{value}</span>
      {status ? (
        <span className={styles.statusError}>
          <Icon name="warning" size={18} />
          {status.text}
        </span>
      ) : null}
      {detail ? <span className={styles.metricDetail}>{detail}</span> : null}
    </li>
  );
}

/** Metric cards as a list: 1 column on phones, 2 on tablets, a row on desktop. */
export function MetricGrid({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ul className={styles.metricGrid} aria-label={label}>
      {children}
    </ul>
  );
}
