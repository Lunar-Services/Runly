"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brand } from "./brand";
import { countries } from "@/lib/countries";
import payment from "./payment-success.module.css";
import styles from "./checkout-page.module.css";

type CheckoutPlan = {
  id: string;
  name: string;
  price_cents: number | null;
  window_3h_tokens: number;
  window_7d_tokens: number;
};
const samplePlan: CheckoutPlan = {
  id: "creator",
  name: "Creator",
  price_cents: 2900,
  window_3h_tokens: 0,
  window_7d_tokens: 0,
};
function money(cents: number | null, whole = false) {
  return cents === null
    ? "Unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: whole && cents % 100 === 0 ? 0 : 2,
      }).format(cents / 100);
}
function Icon({ name, size }: { name: string; size: number }) {
  return (
    <Image
      src={`/figma/payment/${name}.svg`}
      alt=""
      width={size}
      height={size}
      aria-hidden="true"
    />
  );
}

export function CheckoutPage({
  planId = "",
  changingPlan = false,
  preview = false,
}: {
  planId?: string;
  changingPlan?: boolean;
  preview?: boolean;
}) {
  const isPreview = process.env.NODE_ENV === "development" && preview;
  const [plan, setPlan] = useState<CheckoutPlan | null>(
    isPreview ? samplePlan : null,
  );
  const [loading, setLoading] = useState(!isPreview);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const lock = useRef(false);
  const router = useRouter();
  useEffect(() => {
    if (isPreview) return;
    const controller = new AbortController();
    fetch("/api/billing/plans", {
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.message || "Couldn't load this plan. Please try again.",
          );
        const selected = (data.plans as CheckoutPlan[]).find(
          (item) => item.id === planId,
        );
        if (!selected)
          throw new Error(
            "This plan is no longer available. Choose another plan to continue.",
          );
        if (!controller.signal.aborted) setPlan(selected);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(
            error instanceof Error ? error.message : "Couldn't load this plan.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isPreview, planId, revision]);

  async function continueCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || !plan || plan.price_cents === null) return;
    if (isPreview) {
      router.push("/settings/billing/success?preview=true");
      return;
    }
    lock.current = true;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(
        changingPlan ? "/api/billing/portal" : "/api/billing/checkout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: plan.id }),
          signal: AbortSignal.timeout(30000),
        },
      );
      const data = await response.json();
      if (
        response.status === 409 &&
        /^You already have/.test(data.message || "")
      ) {
        router.push("/settings/billing/upgrade");
        return;
      }
      if (!response.ok)
        throw new Error(
          data.message || "Couldn't open checkout. Please try again.",
        );
      const url = new URL(data.url);
      if (url.protocol !== "https:")
        throw new Error(
          "The checkout link could not be verified. Please try again.",
        );
      window.location.assign(url.href);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Couldn't open checkout. Please try again.",
      );
      setPending(false);
      lock.current = false;
    }
  }
  const features = isPreview
    ? [
        "More room for videos, websites, and apps",
        "Custom domains and project history",
        "Manage your subscription in settings",
      ]
    : plan
      ? [
          `${plan.window_3h_tokens.toLocaleString()} tokens per 3 hours`,
          `${plan.window_7d_tokens.toLocaleString()} tokens per week`,
          "Manage your subscription in settings",
        ]
      : [];

  return (
    <div className={`${payment.page} ${styles.page}`}>
      <header className={styles.header}>
        <div className={styles.headerLinks}>
          <Brand className={payment.brand} logoSrc="/figma/admin/b9eb4.png" />
          <Link className={styles.back} href="/settings/billing/upgrade">
            Back to plans
          </Link>
        </div>
        <span className={styles.environmentLabel}>
          {isPreview ? "Checkout design · Preview" : "Secure checkout"}
        </span>
      </header>
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1>Make space for more.</h1>
          <p>
            {plan
              ? `Complete your ${changingPlan ? "plan change" : "upgrade"} to Runly ${plan.name}.`
              : "Review your plan and continue to checkout."}
          </p>
        </div>
        {loading ? (
          <p className={styles.notice} role="status">
            Loading your plan…
          </p>
        ) : loadError ? (
          <div className={styles.notice} role="alert">
            <p>{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoadError("");
                setLoading(true);
                setRevision((value) => value + 1);
              }}
            >
              Try again
            </button>
            <Link href="/settings/billing/upgrade">View available plans</Link>
          </div>
        ) : (
          plan && (
            <div className={styles.columns}>
              <section
                className={styles.paymentPanel}
                aria-labelledby="payment-details-heading"
              >
                <h2 id="payment-details-heading">Payment details</h2>
                <div className={styles.method}>
                  <Icon name="card-method" size={21} />
                  <strong>Credit or debit card</strong>
                  <span>VISA Mastercard</span>
                </div>
                <form
                  id="runly-checkout-form"
                  onSubmit={continueCheckout}
                  autoComplete="off"
                >
                  {isPreview ? (
                    <div className={styles.fields}>
                      <label className={styles.field}>
                        <span>Email address</span>
                        <input
                          type="email"
                          placeholder="you@example.com"
                          autoComplete="off"
                          required
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Name on card</span>
                        <input
                          placeholder="Full name"
                          autoComplete="off"
                          required
                          maxLength={120}
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Card number</span>
                        <span className={styles.inputIcon}>
                          <input
                            inputMode="numeric"
                            placeholder="1234 1234 1234 1234"
                            autoComplete="off"
                            pattern="[0-9 ]{12,23}"
                            required
                            maxLength={23}
                          />
                          <Icon name="card-field" size={21} />
                        </span>
                      </label>
                      <div className={styles.fieldRow}>
                        <label className={styles.field}>
                          <span>Expiration date</span>
                          <input
                            placeholder="MM / YY"
                            autoComplete="off"
                            inputMode="numeric"
                            pattern="(0[1-9]|1[0-2])\s?/\s?[0-9]{2}"
                            required
                            maxLength={7}
                          />
                        </label>
                        <label className={styles.field}>
                          <span>Security code</span>
                          <input
                            inputMode="numeric"
                            placeholder="CVC"
                            autoComplete="off"
                            required
                            pattern="[0-9]{3,4}"
                            maxLength={4}
                          />
                        </label>
                      </div>
                      <div className={styles.fieldRow}>
                        <label className={styles.field}>
                          <span>Billing country</span>
                          <span className={styles.inputIcon}>
                            <select defaultValue="" required>
                              <option value="" disabled>
                                Select your country
                              </option>
                              {countries.map((country) => (
                                <option value={country.code} key={country.code}>
                                  {country.name}
                                </option>
                              ))}
                            </select>
                            <Icon name="chevron-down" size={19} />
                          </span>
                        </label>
                        <label className={styles.field}>
                          <span>Postal code</span>
                          <input
                            placeholder="Postal code"
                            autoComplete="off"
                            maxLength={20}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.secureEntry}>
                      <h3>Enter your payment details securely with Stripe.</h3>
                      <p>
                        Continue to enter your card and billing address, review
                        tax, and confirm your subscription.
                      </p>
                      <p>
                        {changingPlan
                          ? "Stripe will show any prorated charges or credits before you confirm."
                          : "Your card details are collected on Stripe’s secure payment page."}
                      </p>
                    </div>
                  )}
                </form>
                <p className={styles.taxNote}>
                  Tax is calculated after you enter your billing address.
                </p>
                <div className={styles.trustNote}>
                  <Icon name="billing-check" size={19} />
                  <p>
                    Your payment information is used only for billing.
                    <br />
                    Final totals are shown before you confirm.
                  </p>
                </div>
                {isPreview && (
                  <p className={styles.sampleHint}>
                    Use sample details only. Nothing is sent or saved.
                  </p>
                )}
              </section>
              <aside className={styles.orderColumn}>
                <section
                  className={styles.orderPanel}
                  aria-labelledby="order-summary-heading"
                >
                  <h2 id="order-summary-heading">Order summary</h2>
                  <div className={styles.planDescription}>
                    <span>{plan.name}</span>
                    <p>Monthly subscription</p>
                  </div>
                  <p className={styles.price}>
                    {money(plan.price_cents, true)}
                    <span>/ month</span>
                  </p>
                  <p className={styles.currency}>
                    {isPreview ? "Proposed plan" : "Monthly plan"} · USD
                  </p>
                  <ul className={styles.features}>
                    {features.map((feature) => (
                      <li key={feature}>
                        <Icon name="feature-check" size={17} />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <dl className={styles.totals}>
                    <div>
                      <dt>Subtotal</dt>
                      <dd>{money(plan.price_cents)}</dd>
                    </div>
                    <div>
                      <dt>Tax</dt>
                      <dd>Calculated at next step</dd>
                    </div>
                    <div className={styles.total}>
                      <dt>
                        {changingPlan
                          ? "Monthly price before tax"
                          : "Total before tax"}
                      </dt>
                      <dd>{money(plan.price_cents)}</dd>
                    </div>
                  </dl>
                  {message && (
                    <p className={styles.error} role="alert">
                      {message}
                    </p>
                  )}
                  <button
                    form="runly-checkout-form"
                    type="submit"
                    className={styles.continue}
                    disabled={pending || plan.price_cents === null}
                  >
                    {pending ? "Opening Stripe…" : "Review and continue"}
                  </button>
                  {plan.price_cents === null && (
                    <p className={styles.error}>
                      Pricing is currently unavailable. Please choose another
                      plan.
                    </p>
                  )}
                </section>
                <div className={styles.orderFooter}>
                  <p>
                    You can review the final amount and renewal terms before
                    confirming your subscription.
                  </p>
                  <Link href="/support">Need help? Contact support</Link>
                </div>
              </aside>
            </div>
          )
        )}
        <p className={styles.footer}>
          {isPreview
            ? "Design preview. No payment is collected. Sample prices and terms are for review."
            : "Your final total and renewal terms are confirmed in Stripe before payment."}
        </p>
      </main>
    </div>
  );
}
