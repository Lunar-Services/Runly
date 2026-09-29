"use client";

import { useId, useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import styles from "./react-bits.module.css";

export function LatticeLoader({
  label = "Runly is working",
}: {
  label?: string;
}) {
  return (
    <div className={styles.latticeWrap} role="status" aria-label={label}>
      <span className={styles.lattice} aria-hidden="true">
        {Array.from({ length: 16 }, (_, index) => (
          <i key={index} style={{ "--cell": index } as React.CSSProperties} />
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}

export function CallChip({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value?: string | number;
  tone?: "neutral" | "good" | "bad";
}) {
  return (
    <span className={`${styles.callChip} ${styles[tone]}`}>
      <b>{label}</b>
      {value !== undefined && <span>{value}</span>}
    </span>
  );
}

export function CodeSlots({
  items,
}: {
  items: Array<{ label: string; value: string | number }>;
}) {
  return (
    <div className={styles.codeSlots}>
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function CometDial({
  value,
  label,
  detail,
}: {
  value: number;
  label: string;
  detail: string;
}) {
  const normalized = Math.max(0, Math.min(100, value));
  return (
    <div
      className={styles.cometDial}
      role="img"
      aria-label={`${label}: ${Math.round(normalized)}%. ${detail}`}
    >
      <svg
        className={styles.dialTrack}
        viewBox="0 0 160 160"
        aria-hidden="true"
      >
        <circle cx="80" cy="80" r="72" />
        <circle
          cx="80"
          cy="80"
          r="72"
          pathLength="100"
          strokeDasharray={`${normalized} 100`}
        />
      </svg>
      <div>
        <strong>{Math.round(normalized)}%</strong>
        <span>{label}</span>
        <small>{detail}</small>
      </div>
    </div>
  );
}

export function BranchedMenu({
  label = "Actions",
  actions,
}: {
  label?: string;
  actions: Array<{ label: string; danger?: boolean; onSelect: () => void }>;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={styles.branchMenu}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={21} />
      </button>
      {open && (
        <div id={id} role="menu">
          {actions.map((action) => (
            <button
              type="button"
              role="menuitem"
              className={action.danger ? styles.dangerAction : ""}
              key={action.label}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              {action.label}
              <ChevronDown size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FlexCarousel({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className={styles.flexCarousel} aria-label={label}>
      {children}
    </div>
  );
}
