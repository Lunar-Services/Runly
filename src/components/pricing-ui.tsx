"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerHeader } from "./customer-header";
import { CustomerFooter } from "./customer-footer";
import styles from "./pricing-ui.module.css";

export type Plan = {
  id: string;
  name: string;
  price_cents: number | null;
  currency?: string;
  cadence?: string;
  window_3h_tokens: number;
  window_7d_tokens: number;
};

export function PricingUI({
  initialPlans,
  initialError = "",
}: {
  initialPlans?: Plan[];
  initialError?: string;
}) {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>(initialPlans || []);
  const [loading, setLoading] = useState(initialPlans === undefined);
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState("");
  useEffect(() => {
    if (initialPlans !== undefined) return;
    const controller = new AbortController();
    fetch("/api/billing/plans", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message || "Couldn't load plans.");
        setPlans(Array.isArray(result.plans) ? result.plans : []);
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error ? reason.message : "Couldn't load plans.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [initialPlans]);
  async function choosePlan(plan: Plan) {
    if (pending || plan.price_cents === null) return;
    setPending(plan.id);
    router.push(
      `/settings/billing/checkout?plan=${encodeURIComponent(plan.id)}`,
    );
  }
  return (
    <div className={styles.page}>
      <CustomerHeader />
      <main className={styles.main} id="customer-content">
        <header className={styles.heading}>
          <h1>
            Your ideas. More possibilities.<em>Find your room to create.</em>
          </h1>
          <p>Video, websites, and apps. One Runly workspace.</p>
          <p>Plans and prices currently available for your account.</p>
        </header>
        <section className={styles.grid} aria-label="Compare plans">
          {plans.map((plan, index) => (
            <article
              key={plan.name}
              className={`${styles.card} ${index === 0 ? styles.featured : ""}`}
            >
              <div className={styles.cardHeading}>
                <h2>{plan.name}</h2>
                {index === 0 && <span>Available plan</span>}
              </div>
              <p className={styles.description}>
                Published Runly subscription plan
              </p>
              <p className={styles.price}>
                {plan.price_cents === null
                  ? "Contact us"
                  : new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: (plan.currency || "usd").toUpperCase(),
                    }).format(plan.price_cents / 100)}
                <small>
                  {plan.price_cents === null
                    ? ""
                    : ` / ${plan.cadence || "month"}`}
                </small>
              </p>
              <button
                className={styles.choose}
                disabled={Boolean(pending) || plan.price_cents === null}
                onClick={() => void choosePlan(plan)}
              >
                {pending === plan.id
                  ? "Opening checkout…"
                  : `Choose ${plan.name}`}
              </button>
              <ul>
                {[
                  `${plan.window_3h_tokens.toLocaleString()} tokens per 3-hour window`,
                  `${plan.window_7d_tokens.toLocaleString()} tokens per 7-day window`,
                ].map((feature) => (
                  <li key={feature}>
                    <Image
                      src="/figma/pricing/check.svg"
                      alt=""
                      width={17}
                      height={17}
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
        <section className={styles.faq} aria-labelledby="plans-faq">
          <h2 id="plans-faq">Every plan starts with your imagination.</h2>
          <p>Choose a plan, then keep creating in the same workspace.</p>
          <details>
            <summary>Can I change plans later?</summary>
            <p>
              You can review your plan and billing preferences in your account.
            </p>
          </details>
          <details>
            <summary>Can I create videos, websites, and apps?</summary>
            <p>
              Projects and saved source are available. Sandbox execution and
              rendered video export are not enabled in this local setup.
            </p>
          </details>
        </section>
        {(loading || error || (!plans.length && !loading)) && (
          <p role={error ? "alert" : "status"}>
            {loading
              ? "Loading published plans…"
              : error || "No paid plans are currently published."}
          </p>
        )}
        <div className={styles.note}>
          <span>
            Plan availability and charges are confirmed by Runly checkout.
          </span>
          <Link href="/support">Contact support</Link>
        </div>
      </main>
      <CustomerFooter />
    </div>
  );
}
