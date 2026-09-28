import styles from "./terminal-demo.module.css";

export function TerminalDemo() {
  return (
    <div className={styles.terminal}>
      <div className={styles.header}>
        <span>Status</span>
        <span className={styles.controls}>
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className={styles.body}>
        <span>Sketching an outline...</span>
      </div>
    </div>
  );
}
