"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const [position, setPosition] = useState({ top: 0, left: 0, side: "below" });
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      )
        setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const closeOnViewportChange = () => setOpen(false);
    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const panelWidth = 220;
    const panelHeight = Math.min(actions.length * 41 + 12, 280);
    const gap = 7;
    const openAbove =
      window.innerHeight - rect.bottom < panelHeight + gap &&
      rect.top > panelHeight + gap;
    setPosition({
      top: openAbove
        ? Math.max(8, rect.top - panelHeight - gap)
        : Math.min(window.innerHeight - panelHeight - 8, rect.bottom + gap),
      left: Math.max(
        8,
        Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - 8),
      ),
      side: openAbove ? "above" : "below",
    });
    setOpen(true);
  };

  const panel = open ? (
    <div
      className={styles.branchPanel}
      data-side={position.side}
      id={id}
      role="menu"
      ref={panelRef}
      style={{ top: position.top, left: position.left }}
    >
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
  ) : null;

  return (
    <div className={styles.branchMenu}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
      >
        <MoreHorizontal size={21} />
      </button>
      {panel && createPortal(panel, document.body)}
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
