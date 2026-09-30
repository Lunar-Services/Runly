"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import styles from "./pricing-cards.module.css";

const plans = [
  {
    id: "standard",
    name: "Standard",
    price: 3,
    description: "A place to start.",
    features: [
      "100k tokens per 3-hour window",
      "600k tokens per 7-day window",
      "AI chat and project workspaces",
      "Keep conversations and files together",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 9,
    description: "Room for your next idea.",
    features: [
      "350k tokens per 3-hour window",
      "2m tokens per 7-day window",
      "AI chat and project workspaces",
      "More capacity for focused work",
    ],
  },
  {
    id: "cowork",
    name: "Cowork",
    price: 19,
    description: "Bring your people together.",
    features: [
      "1m tokens per 3-hour window",
      "5m shared tokens per 7-day window",
      "Shared team workspace",
      "Build with your collaborators",
    ],
  },
];

export function PricingCards({ initialPlan }: { initialPlan?: string }) {
  const router = useRouter();
  const locked = useRef(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<{ plan: string; message: string } | null>(
    null,
  );
  async function checkout(plan: string) {
    if (locked.current) return;
    locked.current = true;
    setPending(plan);
    setError(null);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, months: 1 }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push(
          `/login?next=${encodeURIComponent(`/?plan=${plan}#pricing`)}`,
        );
        return;
      }
      if (!response.ok)
        throw new Error(result.message || "Checkout is unavailable right now.");
      if (typeof result.url !== "string")
        throw new Error("Checkout is unavailable right now.");
      window.location.assign(result.url);
    } catch (reason) {
      setError({
        plan,
        message:
          reason instanceof Error
            ? reason.message
            : "Checkout is unavailable right now.",
      });
    } finally {
      locked.current = false;
      setPending(null);
    }
  }
  return (
    <div className={styles.pricing}>
      <div className={styles.heading}>
        <p>A PLAN FOR YOUR PACE</p>
        <h2>Pricing</h2>
      </div>
      <div className={styles.grid}>
        {plans.map((plan) => (
          <article
            key={plan.id}
            className={`${styles.card} ${plan.id === "pro" ? styles.featured : ""}`}
            data-selected={initialPlan === plan.id || undefined}
          >
            <div className={styles.top}>
              <div className={styles.label}>
                <h3>{plan.name}</h3>
              </div>
              <p className={styles.price}>
                <strong>${plan.price}</strong>
                <span>/month</span>
              </p>
              <p className={styles.description}>{plan.description}</p>
            </div>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <span className={styles.check}>
                    <Check size={13} aria-hidden="true" />
                  </span>
                  {feature}
                </li>
              ))}
            </ul>
            <div className={styles.bottom}>
              <button
                type="button"
                disabled={pending !== null}
                aria-busy={pending === plan.id}
                onClick={() => checkout(plan.id)}
              >
                {pending === plan.id
                  ? "Opening checkout…"
                  : `Choose ${plan.name}`}
              </button>
              <div className={styles.feedback} aria-live="polite">
                {error?.plan === plan.id && <p role="alert">{error.message}</p>}
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className={styles.note}>
        Prices in USD. Billed monthly for a one-month term, then ends
        automatically.
      </p>
    </div>
  );
}
