"use client";

import { useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import "./FlipCard.css";

/** React Bits FlipCard adapted to readable team profiles and an explicit keyboard control. */
export default function FlipCard({
  front,
  back,
  name,
}: {
  front: ReactNode;
  back: ReactNode;
  name: string;
}) {
  const [flipped, setFlipped] = useState(false);
  const reduced = useReducedMotion();
  return (
    <article className="flip-card">
      <div className="flip-card-stage">
        <motion.div
          className="flip-card-rotor"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 170, damping: 24 }
          }
        >
          <div className="flip-card-face" aria-hidden={flipped} inert={flipped}>
            {front}
          </div>
          <div
            className="flip-card-face flip-card-back"
            aria-hidden={!flipped}
            inert={!flipped}
          >
            {back}
          </div>
        </motion.div>
      </div>
      <button
        type="button"
        className="flip-card-control"
        aria-label={`${flipped ? "Close" : "Read"} ${name}'s profile`}
        aria-pressed={flipped}
        onClick={() => setFlipped((value) => !value)}
      >
        {flipped ? "Back to overview" : "Read full profile"}
        <span aria-hidden="true">{flipped ? "−" : "+"}</span>
      </button>
    </article>
  );
}
