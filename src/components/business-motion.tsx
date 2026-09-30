"use client";

import { RunlyFaq } from "./runly-faq";
import ParticleText from "./react-bits/ParticleText";
import { useTheme } from "./theme-provider";
import "./business-stories.css";

export function BusinessMotion() {
  const { darkTheme } = useTheme();
  return (
    <section
      className="business-motion"
      aria-label="Questions and your next chapter"
    >
      <RunlyFaq />
      <div
        className="business-type"
        aria-label="Turn an idea into your next chapter"
      >
        <ParticleText
          text="Your next chapter."
          trigger="mount"
          pointerRepel={40}
          repelRadius={120}
          color={darkTheme ? "#f2f2f2" : "#191919"}
          highlightColor={darkTheme ? "#bcbcbc" : "#656565"}
        />
        <span>Make something worth sharing.</span>
      </div>
    </section>
  );
}
