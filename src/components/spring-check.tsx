"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import styles from "./spring-check.module.css";

export function SpringCheck({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  disabled?: boolean;
}) {
  return (
    // Use a div wrapper so links inside `label` are not nested inside a <button>
    <div className={styles.check}>
      <button
        className={styles.boxBtn}
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        aria-label="Accept terms"
      >
        <motion.span
          className={styles.box}
          whileTap={{ scale: 0.94 }}
          animate={{ scale: checked ? [1, 1.13, 1] : 1 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden="true"
        >
          <motion.span
            className={styles.fill}
            initial={false}
            animate={{ scale: checked ? 1 : 0 }}
            transition={{ type: "spring", duration: 0.24, bounce: 0.22 }}
          />
          <AnimatePresence>
            {checked && (
              <motion.span
                className={styles.icon}
                initial={{ opacity: 0, y: 5, scale: 0.7 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.75 }}
                transition={{ type: "spring", duration: 0.24, bounce: 0.15 }}
              >
                <HugeiconsIcon icon={Tick02Icon} size={18} strokeWidth={2.5} />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.span>
      </button>
      <span
        className={styles.label}
        onClick={() => !disabled && onChange(!checked)}
      >
        {label}
      </span>
    </div>
  );
}
