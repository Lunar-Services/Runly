"use client";

import { useRef, type ReactNode } from "react";
import Image from "next/image";
import {
  motion,
  useMotionValue,
  useSpring,
  useReducedMotion,
} from "motion/react";
import "./TiltedCard.css";

const spring = { damping: 30, stiffness: 100, mass: 2 };

/** Adapted from the supplied React Bits TiltedCard; touch scrolling stays native. */
export default function TiltedCard({
  imageSrc,
  altText,
  overlayContent,
  rotateAmplitude = 5,
  scaleOnHover = 1.015,
}: {
  imageSrc: string;
  altText: string;
  overlayContent?: ReactNode;
  rotateAmplitude?: number;
  scaleOnHover?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const rotateX = useSpring(useMotionValue(0), spring);
  const rotateY = useSpring(useMotionValue(0), spring);
  const scale = useSpring(1, spring);
  const reset = () => {
    rotateX.set(0);
    rotateY.set(0);
    scale.set(1);
  };
  return (
    <figure
      ref={ref}
      className="tilted-card-figure"
      onPointerMove={(event) => {
        if (reduced || event.pointerType !== "mouse" || !ref.current) return;
        const rect = ref.current.getBoundingClientRect();
        rotateX.set(
          (-(event.clientY - rect.top - rect.height / 2) / (rect.height / 2)) *
            rotateAmplitude,
        );
        rotateY.set(
          ((event.clientX - rect.left - rect.width / 2) / (rect.width / 2)) *
            rotateAmplitude,
        );
        scale.set(scaleOnHover);
      }}
      onPointerLeave={reset}
    >
      <motion.div
        className="tilted-card-inner"
        style={{ rotateX, rotateY, scale }}
      >
        <Image
          src={imageSrc}
          alt={altText}
          width={1536}
          height={1024}
          sizes="(max-width: 760px) 92vw, 54vw"
          className="tilted-card-img"
        />
        {overlayContent && (
          <div className="tilted-card-overlay">{overlayContent}</div>
        )}
      </motion.div>
    </figure>
  );
}
