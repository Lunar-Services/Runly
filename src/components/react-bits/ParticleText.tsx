"use client";

import { useEffect, useRef } from "react";
import "./ParticleText.css";

/** Canvas glyph sampling and gather/repel motion adapted from the supplied React Bits source. */
export default function ParticleText({
  text,
  color = "#ffffff",
  highlightColor = "#aaaaaa",
  particleSize = 1.7,
  density = 3,
  scatter = 60,
  gatherDuration = 1400,
  stagger = 240,
  pointerRepel = 16,
  repelRadius = 80,
  idleDrift = 0.3,
  fontSize = 72,
  fontWeight = 400,
  fontFamily = "Georgia",
  trigger = "hover",
  glow = false,
}: {
  text: string;
  color?: string;
  highlightColor?: string;
  particleSize?: number;
  density?: number;
  scatter?: number;
  gatherDuration?: number;
  stagger?: number;
  pointerRepel?: number;
  repelRadius?: number;
  idleDrift?: number;
  fontSize?: number;
  fontWeight?: number;
  fontFamily?: string;
  trigger?: "mount" | "hover" | "click";
  glow?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const formed = useRef(false);
  useEffect(() => {
    const host = root.current,
      surface = canvas.current;
    const ctx = surface?.getContext("2d");
    if (!host || !surface || !ctx) return;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let disposed = false,
      visible = false,
      frame = 0,
      build = 0,
      width = 0,
      height = 0,
      start = 0;
    let particles: {
      x: number;
      y: number;
      sx: number;
      sy: number;
      tx: number;
      ty: number;
      seed: number;
      color: string;
    }[] = [];
    const pointer = { active: false, x: 0, y: 0 };
    function gather() {
      if (!particles.length) return;
      if (trigger === "mount" && formed.current) return;
      formed.current = true;
      if (host) host.dataset.formed = "true";
      start = performance.now();
      particles.forEach((p) => {
        const angle = p.seed * Math.PI * 2;
        p.sx = p.tx + Math.cos(angle) * scatter;
        p.sy = p.ty + Math.sin(angle) * scatter;
      });
    }
    function render(now: number) {
      frame = 0;
      if (!ctx || !visible || disposed || media.matches) return;
      ctx.clearRect(0, 0, width, height);
      ctx.shadowBlur = glow ? particleSize * 2 : 0;
      ctx.shadowColor = highlightColor;
      for (const p of particles) {
        const t = Math.max(
          0,
          Math.min(1, (now - start - p.seed * stagger) / gatherDuration),
        );
        const ease = 1 - Math.pow(1 - t, 3);
        let x = p.sx + (p.tx - p.sx) * ease,
          y = p.sy + (p.ty - p.sy) * ease;
        if (t === 1) {
          x += Math.sin(now / 1100 + p.seed * 10) * idleDrift;
          y += Math.cos(now / 1200 + p.seed * 10) * idleDrift;
        }
        const dx = x - pointer.x,
          dy = y - pointer.y,
          distance = Math.hypot(dx, dy);
        if (pointer.active && distance > 0 && distance < repelRadius) {
          const force = (1 - distance / repelRadius) ** 2 * pointerRepel;
          x += (dx / distance) * force;
          y += (dy / distance) * force;
        }
        p.x += (x - p.x) * 0.22;
        p.y += (y - p.y) * 0.22;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, particleSize, particleSize);
      }
      frame = requestAnimationFrame(render);
    }
    async function sample() {
      const id = ++build;
      if (media.matches) {
        host?.removeAttribute("data-ready");
        cancelAnimationFrame(frame);
        frame = 0;
        return;
      }
      await document.fonts.ready;
      if (disposed || id !== build || !host || !surface || !ctx) return;
      width = host.clientWidth;
      height = host.clientHeight;
      if (!width || !height) return;
      const ratio = Math.min(devicePixelRatio, 2);
      surface.width = width * ratio;
      surface.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const off = document.createElement("canvas");
      off.width = width;
      off.height = height;
      const pen = off.getContext("2d", { willReadFrequently: true });
      if (!pen) return;
      pen.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
      const size = Math.min(
        fontSize,
        fontSize * ((width * 0.9) / Math.max(1, pen.measureText(text).width)),
      );
      pen.font = `${fontWeight} ${size}px ${fontFamily}`;
      pen.textAlign = "center";
      pen.textBaseline = "middle";
      pen.fillStyle = "white";
      pen.fillText(text, width / 2, height / 2);
      const pixels = pen.getImageData(0, 0, width, height).data;
      particles = [];
      const step = Math.max(2, density);
      for (let y = 0; y < height; y += step)
        for (let x = 0; x < width; x += step) {
          if (pixels[(y * width + x) * 4 + 3] > 80) {
            const seed = ((x * 31 + y * 17) % 1000) / 1000;
            particles.push({
              x,
              y,
              sx: x,
              sy: y,
              tx: x,
              ty: y,
              seed,
              color: seed > 0.7 ? highlightColor : color,
            });
          }
        }
      host.dataset.ready = "true";
      if (formed.current) {
        start = performance.now() - gatherDuration - stagger;
      } else if (visible) {
        gather();
      }
      if (visible && !frame) frame = requestAnimationFrame(render);
    }
    const enter = () => {
      if (trigger === "hover" && !media.matches) gather();
    };
    const click = () => {
      if (trigger === "click" && !media.matches) gather();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const rect = surface.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    };
    const leave = () => {
      pointer.active = false;
    };
    const resize = new ResizeObserver(() => {
      void sample();
    });
    resize.observe(host);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame) {
        gather();
        frame = requestAnimationFrame(render);
      } else if (!visible) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    observer.observe(host);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    host.addEventListener("click", click);
    media.addEventListener("change", sample);
    void sample();
    return () => {
      disposed = true;
      ++build;
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      host.removeEventListener("click", click);
      media.removeEventListener("change", sample);
    };
  }, [
    text,
    color,
    highlightColor,
    particleSize,
    density,
    scatter,
    gatherDuration,
    stagger,
    pointerRepel,
    repelRadius,
    idleDrift,
    fontSize,
    fontWeight,
    fontFamily,
    trigger,
    glow,
  ]);
  return (
    <div ref={root} className="particle-text">
      <canvas ref={canvas} aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
