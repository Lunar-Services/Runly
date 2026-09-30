"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useTheme } from "./theme-provider";

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
  const { darkTheme } = useTheme();
  const film = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = film.current;
    if (!video) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    });
    observer.observe(video);
    return () => {
      observer.disconnect();
      video.pause();
    };
  }, [darkTheme]);
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
              key={darkTheme ? "dark" : "light"}
              className={styles.productFilm}
              src={`/videos/idea-to-store-${darkTheme ? "dark" : "light"}.mp4?v=2`}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              poster={
                darkTheme ? undefined : "/videos/idea-to-store-poster.jpg"
              }
              aria-label="An illustrative website taking shape with Runly"
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
