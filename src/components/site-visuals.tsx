"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "./theme-provider";
import "./site-visuals.css";

const Silk = dynamic(() => import("./react-bits/Silk"), { ssr: false });
const FlexCarousel = dynamic(() => import("./react-bits/FlexCarousel"), {
  ssr: false,
});

const stories = [
  {
    src: "/images/stories/7456.png",
    title: "Give your ideas a direction.",
    subtitle: "Plan, connect, and take the next step.",
    alt: "Runly's black cat surrounded by planning and insight diagrams",
  },
  {
    src: "/images/stories/23545.png",
    title: "Less busywork. More momentum.",
    subtitle: "Draft, research, and work through the details.",
    alt: "Runly's cat at a laptop beside email, document, and spreadsheet illustrations",
  },
  {
    src: "/images/stories/2346.png",
    title: "Keep the whole picture in view.",
    subtitle: "Bring context into every conversation.",
    alt: "A reading cat connecting a project brief, conversation, and task board",
  },
  {
    src: "/images/stories/547.png",
    title: "A little curiosity goes a long way.",
    subtitle: "Explore a workflow that feels like yours.",
    alt: "Runly's cat reading beside workflow and preference illustrations",
  },
  {
    src: "/images/stories/456.png",
    title: "Make room for your next idea.",
    subtitle: "Your curious collaborator, close at hand.",
    alt: "A black cat peeking over a laptop in a sunlit home office",
  },
];

class VisualFallback extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function SilkBackground() {
  const { darkTheme } = useTheme();
  const root = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => {
      setEnabled(!reduce.matches);
      setActive(visible && !document.hidden && !reduce.matches);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    reduce.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer.disconnect();
      reduce.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return (
    <div ref={root} className="runly-silk" aria-hidden="true">
      {enabled && (
        <VisualFallback fallback={null}>
          <Silk
            key={darkTheme ? "dark" : "light"}
            color={darkTheme ? "#272727" : "#e6e6e6"}
            lightMode={!darkTheme}
            speed={2.5}
            scale={1}
            noiseIntensity={0.35}
            active={active}
          />
        </VisualFallback>
      )}
    </div>
  );
}

function StoryFallback({ progress }: { progress: number }) {
  return (
    <div
      className="story-fallback"
      style={{ transform: `translateX(-${progress * 80}%)` }}
    >
      {stories.map((story) => (
        <figure key={story.src}>
          <Image
            src={story.src}
            alt={story.alt}
            width={1448}
            height={1086}
            sizes="(max-width: 700px) 85vw, 600px"
          />
          <figcaption>{story.title}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function ProductStories() {
  const section = useRef<HTMLElement>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const element = section.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const distance = rect.height + window.innerHeight;
      setProgress(
        Math.max(
          0,
          Math.min(1, (window.innerHeight - rect.top) / Math.max(1, distance)),
        ),
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);
  return (
    <section
      ref={section}
      className="runly-stories"
      aria-labelledby="runly-stories-heading"
    >
      <div className="runly-stories-content">
        <div className="runly-stories-heading">
          <p className="runly-story-eyebrow">FROM THOUGHT TO POSSIBILITY</p>
          <h2 id="runly-stories-heading">Big ideas. A little collaborator.</h2>
          <p>A few ways to imagine your next project with Runly.</p>
        </div>
        <div className="runly-stories-carousel">
          <VisualFallback fallback={<StoryFallback progress={progress} />}>
            <FlexCarousel
              items={stories}
              interactive
              scrollDriven
              scrollProgress={progress}
              preset="ribbon"
              bend={0.08}
              dispersion={0}
              squeeze={0.06}
              intro="none"
              cardHeight={0.62}
              gap={24}
              radius={20}
              fit="natural"
              captureWheel={false}
              focusOnClick={false}
              captions
            />
          </VisualFallback>
        </div>
        <p className="runly-stories-hint">
          Scroll to explore, or drag the pictures.
        </p>
      </div>
    </section>
  );
}
