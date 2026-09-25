"use client";

import { useState } from "react";
import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { TerminalDemo } from "./terminal-demo";
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
  const [paused, setPaused] = useState(false);
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
          build. Here is how its planned Pro price compares with popular premium
          AI subscriptions.
        </p>
      </div>

      <div className={styles.layout}>
        <div
          className={`${styles.runlyCard}${paused ? ` ${styles.paused}` : ""}`}
        >
          <div className={styles.visual}>
            <div className={styles.sequence} aria-hidden="true">
              <div className={`${styles.scene} ${styles.promptScene}`}>
                <div className={styles.ideaCard}>
                  <span className={styles.ideaLabel}>
                    An idea, in your words
                  </span>
                  <p>
                    <span className={styles.ideaLineOne}>
                      A small online shop
                    </span>
                    <span className={styles.ideaLineTwo}>
                      for handmade ceramics
                    </span>
                  </p>
                  <span className={styles.ideaArrow}>↗</span>
                </div>
              </div>
              <div className={`${styles.scene} ${styles.terminalScene}`}>
                <TerminalDemo />
              </div>
              <div className={`${styles.scene} ${styles.previewScene}`}>
                <div className={styles.previewPage}>
                  <span className={styles.previewTop}>
                    CLAY & CO. <span>SHOP&nbsp;&nbsp; ABOUT</span>
                  </span>
                  <span className={styles.previewKicker}>MADE BY HAND</span>
                  <strong>Objects for everyday living.</strong>
                  <span className={styles.previewLine} />
                  <span className={styles.previewFoot}>
                    CERAMICS · SMALL BATCH · MADE WITH CARE
                  </span>
                </div>
              </div>
            </div>
            <button
              type="button"
              className={styles.motionToggle}
              onClick={() => setPaused((value) => !value)}
              aria-label={
                paused ? "Play comparison motion" : "Pause comparison motion"
              }
              aria-pressed={paused}
            >
              {paused ? <Play size={13} /> : <Pause size={13} />}
              <span>{paused ? "Play" : "Pause"}</span>
            </button>
          </div>
          <div className={styles.runlyDetails}>
            <div>
              <span className={styles.cardLabel}>Runly Pro</span>
              <strong>
                $9<span>/ month</span>
              </strong>
              <p>Planned price · 350k tokens per 3-hour window</p>
            </div>
            <Link className={styles.action} href="/signup">
              <span>Get started</span>
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
            Runly Pro&apos;s planned monthly price is less than half of each
            listed price above.
          </p>
        </div>
      </div>

      <p className={styles.disclosure}>
        US monthly list prices checked September 24, 2026. Products, features,
        and usage limits differ. Runly pricing is a preview; checkout is not
        available yet. Sources:{" "}
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
