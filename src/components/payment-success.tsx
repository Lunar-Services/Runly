"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { CircleAlert, Clock3, LoaderCircle } from "lucide-react";
import { Brand } from "./brand";
import type { PaymentConfirmation } from "@/lib/payment-confirmation";
import styles from "./payment-success.module.css";

const example: PaymentConfirmation = {
  status: "complete",
  plan: "Creator",
  interval: "month",
  intervalCount: 1,
  amount: 2900,
  currency: "usd",
  email: "you@example.com",
};

function amountPaid(amount: number | null, currency: string) {
  if (amount === null) return "Amount unavailable";
  try {
    const formatter = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return `${formatter.format(amount / 10 ** digits)} ${currency.toUpperCase()}`;
  } catch {
    return "Amount unavailable";
  }
}
function frequency(interval: string | null, count: number) {
  if (!interval) return "";
  if (count !== 1) return `Every ${count} ${interval}s`;
  return (
    (
      {
        month: "Monthly",
        year: "Yearly",
        week: "Weekly",
        day: "Daily",
      } as Record<string, string>
    )[interval] || interval
  );
}

export function PaymentSuccess({
  sessionId = "",
  preview = false,
}: {
  sessionId?: string;
  preview?: boolean;
}) {
  const isPreview = process.env.NODE_ENV === "development" && preview;
  const [confirmation, setConfirmation] = useState<PaymentConfirmation | null>(
    isPreview ? example : null,
  );
  const [loading, setLoading] = useState(!isPreview && Boolean(sessionId));
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (isPreview || !sessionId) return;
    const controller = new AbortController();
    fetch(
      `/api/billing/confirmation?session_id=${encodeURIComponent(sessionId)}`,
      {
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(35000),
        ]),
      },
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.message ||
              "We couldn't confirm this payment. Please try again.",
          );
        if (!controller.signal.aborted)
          setConfirmation(result as PaymentConfirmation);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "We couldn't confirm this payment. Please try again.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [isPreview, sessionId, revision]);

  function retry() {
    setError("");
    setLoading(true);
    setConfirmation(null);
    setRevision((value) => value + 1);
  }
  const paid = confirmation?.status === "complete" ? confirmation : null;
  const expired = confirmation?.status === "expired";
  const heading = loading
    ? "Confirming your payment…"
    : paid
      ? "You’re ready to create."
      : expired
        ? "Checkout has expired."
        : error
          ? "We couldn’t confirm your payment."
          : confirmation?.status === "pending"
            ? "Your payment is processing."
            : "No payment confirmation yet.";
  const description = loading
    ? "This usually takes just a moment."
    : paid
      ? `Welcome to Runly ${paid.plan}.`
      : error ||
        (expired
          ? "You can choose a plan and start checkout again."
          : confirmation?.status === "pending"
            ? "Your payment has not cleared yet. Check its status again shortly."
            : "Your confirmation will appear here after checkout.");

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Brand className={styles.brand} logoSrc="/figma/admin/b9eb4.png" />
        <span className={styles.stateLabel}>
          Payment confirmation{isPreview ? " · Preview" : ""}
        </span>
      </header>
      <main className={styles.main}>
        <section
          className={styles.card}
          aria-labelledby="payment-heading"
          aria-busy={loading}
        >
          <div
            className={`${styles.statusIcon} ${paid ? styles.successIcon : ""}`}
            aria-hidden="true"
          >
            {paid ? (
              <Image
                src="/figma/payment/check.svg"
                alt=""
                width={33}
                height={33}
              />
            ) : loading ? (
              <LoaderCircle className={styles.spinner} size={32} />
            ) : confirmation?.status === "pending" ? (
              <Clock3 size={32} />
            ) : (
              <CircleAlert size={32} />
            )}
          </div>
          <div className={styles.intro} aria-live="polite">
            <h1 id="payment-heading">{heading}</h1>
            <p>{description}</p>
          </div>
          {paid && (
            <dl className={styles.summary}>
              <div>
                <dt>Plan</dt>
                <dd>
                  {[paid.plan, frequency(paid.interval, paid.intervalCount)]
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
              <div>
                <dt>Amount paid</dt>
                <dd>{amountPaid(paid.amount, paid.currency)}</dd>
              </div>
              <div>
                <dt>{isPreview ? "Receipt" : "Receipt email"}</dt>
                <dd>
                  {isPreview ? "Sent to " : ""}
                  {paid.email || "Available in billing"}
                </dd>
              </div>
            </dl>
          )}
          {!paid && !loading && sessionId && !expired && (
            <button type="button" className={styles.retry} onClick={retry}>
              Check payment status
            </button>
          )}
          <Link href="/dashboard/projects" className={styles.primary}>
            Back to workspace
          </Link>
          <Link href="/settings/billing" className={styles.secondary}>
            Manage billing
          </Link>
          <p className={styles.note}>
            {isPreview
              ? "Illustrative confirmation; no payment has been processed."
              : paid
                ? "You can find your invoices in billing."
                : "You can review your plan and payments in billing."}
          </p>
        </section>
      </main>
    </div>
  );
}
