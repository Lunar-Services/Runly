"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import styles from "./code-slots.module.css";

export type CodeSlotStatus = "idle" | "error" | "success";

export function CodeSlots({
  value,
  status = "idle",
  disabled = false,
  autoFocus = false,
  onChange,
  onComplete,
}: {
  value: string;
  status?: CodeSlotStatus;
  disabled?: boolean;
  autoFocus?: boolean;
  onChange: (code: string) => void;
  onComplete: (code: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const lastCompleted = useRef("");
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countId = useId();
  const [focused, setFocused] = useState(false);
  const clean = value.replace(/\D/g, "").slice(0, 6);
  const active = Math.min(clean.length, 5);

  useEffect(() => {
    if (autoFocus) input.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (status !== "error") return;
    clearTimer.current = setTimeout(() => {
      lastCompleted.current = "";
      onChange("");
      input.current?.focus();
    }, 520);
    return () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, [onChange, status]);

  function update(raw: string) {
    if (disabled || status === "success") return;
    const next = raw.replace(/\D/g, "").slice(0, 6);
    onChange(next);
    if (next.length < 6) lastCompleted.current = "";
    if (next.length === 6 && next !== lastCompleted.current) {
      lastCompleted.current = next;
      onComplete(next);
    }
  }

  return (
    <div className={styles.root}>
      <div
        className={styles.row}
        data-focused={focused}
        data-status={status}
        onMouseDown={() => input.current?.focus()}
      >
        <input
          ref={input}
          className={styles.input}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          aria-label="Six-digit verification code"
          aria-describedby={countId}
          aria-invalid={status === "error"}
          value={clean}
          disabled={disabled || status === "success"}
          onChange={(event) => update(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {Array.from({ length: 6 }, (_, index) => {
          const digit = clean[index] || "";
          return (
            <span
              className={styles.slot}
              data-active={index === active}
              key={index}
              aria-hidden="true"
            >
              <AnimatePresence mode="popLayout">
                {digit ? (
                  <motion.span
                    className={styles.digit}
                    key={digit}
                    initial={{ opacity: 0, y: 9, scale: 0.78 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.82 }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
                  >
                    {digit}
                  </motion.span>
                ) : focused && index === active && status === "idle" ? (
                  <span className={styles.caret} />
                ) : null}
              </AnimatePresence>
            </span>
          );
        })}
        <AnimatePresence>
          {status === "success" && (
            <motion.span
              className={styles.success}
              initial={{ clipPath: "inset(0 50% round 14px)" }}
              animate={{ clipPath: "inset(0 0% round 14px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              aria-hidden="true"
            >
              <motion.span
                initial={{ opacity: 0, y: 8, scale: 0.82 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", delay: 0.22, bounce: 0.22 }}
              >
                <HugeiconsIcon icon={Tick02Icon} size={32} strokeWidth={2.2} />
              </motion.span>
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <span className={styles.srOnly} id={countId} aria-live="polite">
        {status === "success"
          ? "Code accepted"
          : `${clean.length} of 6 digits entered`}
      </span>
    </div>
  );
}
