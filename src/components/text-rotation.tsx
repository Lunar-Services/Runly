"use client";

import { useEffect, useState } from "react";
import styles from "./text-rotation.module.css";

// Adapted for Next.js from the user-supplied Framer TextRotation reference.
const phrases = ["build.", "code.", "chat.", "plan.", "and much more."];

export function TextRotation() {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const motion = window.matchMedia("(max-width: 0px)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      clearInterval(timer);
      if (!motion.matches && !document.hidden)
        timer = setInterval(
          () => setIndex((value) => (value + 1) % phrases.length),
          3000,
        );
    };
    update();
    motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      motion.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <h1 className={styles.heading}>
      <span className="cat-sr-only">
        An AI that can build, code, chat, plan, and much more.
      </span>
      <span aria-hidden="true">
        An AI that can
        <span className={styles.stage}>
          <span key={index} className={styles.word}>
            {phrases[index]}
          </span>
        </span>
      </span>
    </h1>
  );
}
