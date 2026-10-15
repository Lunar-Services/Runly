import Link from "next/link";
import { Brand } from "./brand";
import styles from "./customer-footer.module.css";
export function CustomerFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.identity}>
          <Brand
            className={styles.brand}
            logoSrc="/brand/figma/runly-mark.png"
          />
          <span className={styles.tagline}>Made for what comes next.</span>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/pricing">Plans</Link>
          <Link href="/support">Support</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
      </div>
    </footer>
  );
}
