// Shown while the server reads a syllabus. One polite status message; the bar is
// decorative (and still under reduced motion).
import styles from "./syllabus.module.css";

export function ParseProgress({ filename }: { filename?: string | null }) {
  return (
    <div className={styles.progress}>
      <p role="status" className={styles.progressText}>
        Reading {filename ? <strong>{filename}</strong> : "your syllabus"}… This usually takes under
        a minute. You can leave this page; we&apos;ll keep working.
      </p>
      <div className={styles.progressTrack} aria-hidden="true">
        <div className={styles.progressBar} />
      </div>
    </div>
  );
}
