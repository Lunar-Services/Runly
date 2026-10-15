"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "./landing-showcase.module.css";

export function LandingShowcase({
  revealReady = true,
}: {
  revealReady?: boolean;
}) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = section.current;
    if (element && !revealReady) {
      element.dataset.reveal = "waiting";
      return;
    }
    if (
      !element ||
      !window.IntersectionObserver ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    element.dataset.reveal = "waiting";
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) reveal();
          else if (entry.boundingClientRect.top >= window.innerHeight)
            element.dataset.reveal = "waiting";
        }
      },
      { threshold: 0, rootMargin: "0px 0px 120px 0px" },
    );
    function reveal() {
      element!.dataset.reveal = "visible";
    }
    observer.observe(element);
    element.addEventListener("focusin", reveal);
    return () => {
      observer.disconnect();
      element.removeEventListener("focusin", reveal);
      delete element.dataset.reveal;
    };
  }, [revealReady]);
  return (
    <section
      ref={section}
      data-reveal="waiting"
      className={styles.section}
      aria-label="Illustrated Runly website project"
    >
      <div className={styles.frame}>
        <header className={styles.topbar}>
          <div className={styles.productBrand}>
            <Image
              src="/brand/figma/runly-mark.png"
              alt=""
              width={25}
              height={25}
              aria-hidden="true"
            />
            <span>Runly</span>
          </div>
          <span className={styles.projectName}>Offscript website</span>
          <Link className={styles.workspaceLink} href="/dashboard/projects">
            Open workspace
          </Link>
        </header>

        <div className={styles.projectBody}>
          <section
            className={styles.conversation}
            aria-label="Example conversation"
          >
            <div className={styles.conversationHeading}>
              <span>Example conversation</span>
              <span>Website</span>
            </div>

            <div className={styles.userMessage}>
              A simple site for a small design studio. Warm, clear, and focused
              on the work.
            </div>

            <div className={styles.reply}>
              <div className={styles.replyBrand}>
                <Image
                  src="/brand/figma/runly-mark.png"
                  alt=""
                  width={18}
                  height={18}
                  aria-hidden="true"
                />
                <span>Runly</span>
                <span className={styles.replyCheck} aria-hidden="true">
                  <svg viewBox="0 0 16 16" focusable="false">
                    <path d="m3.5 8.2 2.8 2.7 6.2-6.1" />
                  </svg>
                </span>
              </div>
              <p>
                A starting point: introduce the studio, give the projects room
                to speak, and make it easy to get in touch.
              </p>
            </div>

            <div className={styles.composer} aria-hidden="true">
              <span>Continue the conversation</span>
              <span className={styles.composerArrow}>
                <svg viewBox="0 0 20 20" focusable="false">
                  <path d="M10 15.8V4.2m5 5-5-5-5 5" />
                </svg>
              </span>
            </div>
          </section>

          <section
            className={styles.website}
            aria-label="Sample Offscript website"
          >
            <div className={styles.siteNav}>
              <span className={styles.siteWordmark}>Offscript</span>
              <nav aria-label="Sample website navigation">
                <span>Work</span>
                <span>Studio</span>
                <span>Contact</span>
              </nav>
            </div>

            <div className={styles.siteContent}>
              <p className={styles.siteEyebrow}>Independent design studio</p>
              <h2>
                Good ideas
                <br />
                deserve to
                <br />
                <em>stand out.</em>
              </h2>
              <p className={styles.siteDeck}>
                Thoughtful identities and digital places for people doing
                meaningful work.
              </p>
              <Link className={styles.siteLink} href="/create?idea=website">
                Explore our work
                <span aria-hidden="true">↗</span>
              </Link>
            </div>

            <div className={styles.siteArtwork} aria-hidden="true">
              <span className={styles.artworkShapeOne} />
              <span className={styles.artworkShapeTwo} />
              <span className={styles.artworkLine} />
              <span className={styles.artworkCaption}>
                Selected work · 2025
              </span>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}
