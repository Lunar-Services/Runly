"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import styles from "./subscription-comparison.module.css";

const subscriptions = [
  {
    name: "ChatGPT Plus",
    price: "$20",
    source: "https://help.openai.com/en/articles/6950777-what-is",
  },
  {
    name: "Claude Pro",
    price: "$20",
    source:
      "https://support.claude.com/en/articles/8325606-what-is-the-pro-plan",
  },
  {
    name: "Google AI Pro",
    price: "$19.99",
    source: "https://one.google.com/about/plans",
  },
];

export function SubscriptionComparison() {
  const film = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = film.current;
    if (!video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const syncPlayback = () => {
      if (visible && !document.hidden && !motion.matches) {
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        syncPlayback();
      },
      {
        rootMargin: "80px",
      },
    );
    observer.observe(video);
    document.addEventListener("visibilitychange", syncPlayback);
    motion.addEventListener("change", syncPlayback);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncPlayback);
      motion.removeEventListener("change", syncPlayback);
      video.pause();
    };
  }, []);
  return (
    <section
      className={styles.section}
      aria-labelledby="subscription-comparison-title"
    >
      <div className={styles.intro}>
        <span className={styles.eyebrow}>A different starting point</span>
        <h3 id="subscription-comparison-title">Make room for the idea.</h3>
        <p>
          Runly is focused on websites, tools, and the projects you want to
          build. Here is how its Pro price compares with popular premium AI
          subscriptions.
        </p>
      </div>

      <div className={styles.layout}>
        <div className={styles.runlyCard}>
          <div className={styles.visual}>
            <video
              ref={film}
              className={styles.productFilm}
              src="/videos/runly-intro.mp4"
              muted
              loop
              playsInline
              preload="auto"
              poster="/videos/runly-intro-poster.jpg"
              aria-label="Runly animated logo"
            />
          </div>
          <div className={styles.runlyDetails}>
            <div>
              <span className={styles.cardLabel}>
                Runly Pro · Build your next idea
              </span>
              <strong>
                $9<span>/ month</span>
              </strong>
              <p>350k tokens per 3-hour window</p>
            </div>
            <Link className={styles.action} href="/?plan=pro#pricing">
              <span>Choose a plan</span>
              <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>

        <div className={styles.otherPlans}>
          <div className={styles.listHeading}>
            <span>Premium AI subscriptions</span>
            <span>US monthly price</span>
          </div>
          {subscriptions.map((subscription) => (
            <div className={styles.subscription} key={subscription.name}>
              <span className={styles.subscriptionName}>
                {subscription.name}
              </span>
              <span className={styles.subscriptionPrice}>
                {subscription.price}
                <small>/ month</small>
              </span>
            </div>
          ))}
          <p className={styles.comparisonLine}>
            Runly Pro&apos;s monthly price is less than half of each listed
            price above.
          </p>
        </div>
      </div>

      <p className={styles.disclosure}>
        US monthly list prices checked September 24, 2026. Products, features,
        and usage limits differ. Plans are billed monthly for the term selected
        at checkout. Sources:{" "}
        {subscriptions.map((subscription, index) => (
          <span key={subscription.name}>
            {index > 0 ? ", " : ""}
            <a
              href={subscription.source}
              target="_blank"
              rel="noopener noreferrer"
            >
              {subscription.name}
            </a>
          </span>
        ))}
        .
      </p>
    </section>
  );
}
