import Link from "next/link";
import styles from "./get-started-button.module.css";

function Arrow({ className }: { className: string }) {
  return (
    <svg
      className={`${styles.arrow} ${className}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M16.1716 10.9999 10.8076 5.6359l1.4142-1.4142L20 12l-7.7782 7.7781-1.4142-1.4142L16.1716 13H4v-2h12.1716Z" />
    </svg>
  );
}

export function GetStartedButton() {
  return (
    <Link className={`${styles.button} get-started-cta`} href="/signup">
      <Arrow className={styles.arrowStart} />
      <span className={styles.text}>Get started</span>
      <span className={styles.circle} aria-hidden="true" />
      <Arrow className={styles.arrowEnd} />
    </Link>
  );
}
