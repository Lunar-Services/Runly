"use client";

import { useEffect, useState } from "react";
import styles from "./sky-background.module.css";

export type SkyPhase = "dawn" | "day" | "sunset" | "night";

export function useLocalSky(preview?: SkyPhase) {
  const [phase, setPhase] = useState<SkyPhase>("day");
  useEffect(() => {
    if (preview) return;
    function update() {
      const hour = new Date().getHours();
      setPhase(
        hour >= 20 || hour < 5
          ? "night"
          : hour < 7
            ? "dawn"
            : hour < 17
              ? "day"
              : "sunset",
      );
    }
    update();
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [preview]);
  return preview ?? phase;
}

export function SkyBackground({ phase }: { phase: SkyPhase }) {
  return (
    <div className={`${styles.sky} ${styles[phase]}`} aria-hidden="true">
      <div className={styles.clouds}>
        {Array.from({ length: 4 }, (_, index) => (
          <span className={styles.cloudPanel} key={index} />
        ))}
      </div>
      <div className={styles.atmosphere} />
      <div className={styles.stars} />
      <div className={styles.foregroundClouds}>
        {Array.from({ length: 4 }, (_, index) => (
          <span className={styles.cloudPanel} key={index} />
        ))}
      </div>
    </div>
  );
}
