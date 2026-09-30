"use client";

import { useEffect, useRef } from "react";
import styles from "./cat-animation.module.css";

export function CatAnimation({
  name,
  label,
  width,
  height,
  hero = false,
}: {
  name: string;
  label: string;
  width: number;
  height: number;
  hero?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!element) return;

    let visible = false;
    const update = () => {
      if (visible && !document.hidden) {
        void element.play().catch(() => {
          // The poster stays visible when the browser blocks autoplay.
        });
      } else {
        element.pause();
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(element);

    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();

      document.removeEventListener("visibilitychange", update);
      element.pause();
    };
  }, []);

  return (
    <div
      className={`${styles.animation} ${hero ? styles.hero : ""} ${width > height ? styles.wide : ""}`}
    >
      <video
        ref={video}
        poster={`/cats/${name}-alpha.png?v=3`}
        width={width}
        height={height}
        autoPlay
        muted
        loop
        playsInline
        preload={hero ? "auto" : "none"}
        aria-label={label}
      >
        <source src={`/cats/${name}-alpha.webm?v=3`} type="video/webm" />
        {label}
      </video>
    </div>
  );
}
