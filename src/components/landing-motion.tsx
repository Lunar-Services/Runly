"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function LandingMotion({
  children,
  className,
  variant,
}: {
  children: ReactNode;
  className: string;
  variant: "features" | "steps" | "closing";
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current;
    if (
      !element ||
      !window.IntersectionObserver ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    element.dataset.motion = "waiting";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reveal();
      },
      { threshold: 0, rootMargin: "0px 0px -32px 0px" },
    );
    function reveal() {
      element!.dataset.motion = "visible";
      observer.disconnect();
    }
    observer.observe(element);
    element.addEventListener("focusin", reveal);
    return () => {
      observer.disconnect();
      element.removeEventListener("focusin", reveal);
      delete element.dataset.motion;
    };
  }, []);
  return (
    <div
      ref={container}
      className={`landing-motion ${className}`}
      data-motion-variant={variant}
    >
      {children}
    </div>
  );
}
