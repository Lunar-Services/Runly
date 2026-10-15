"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AccountShell } from "./account-shell";
import { CreditBalancePreview } from "./credit-pricing-preview";

type Plan = {
  id: string;
  name: string;
  price_cents: number | null;
  window_3h_tokens: number;
  window_7d_tokens: number;
};
type Invoice = {
  id: string;
  created: string;
  status: string;
  amount: number;
  currency: string;
  url: string | null;
};
type BillingState = {
  customer: boolean;
  invoices: Invoice[];
  invoicesAvailable: boolean;
  subscription: {
    plan: string;
    active: boolean;
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
};
type BillingDetails = {
  customer: boolean;
  paymentMethod: {
    type: string;
    card: {
      brand: string;
      last4: string;
      expMonth: number;
      expYear: number;
    } | null;
  } | null;
  billingDetails: {
    name: string;
    email: string;
    address: {
      line1: string;
      line2: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    } | null;
  } | null;
  subscriptionPrice: {
    amount: number | null;
    currency: string;
    interval: string;
    intervalCount: number;
  } | null;
};
type Preview = {
  kind: "upgrade" | "downgrade";
  amount?: number;
  currency?: string;
};
type PreviewState = { data?: Preview; error?: string; loading: boolean };

class BillingRequestError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
async function requestJSON<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    cache: "no-store",
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(30000)])
      : AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new BillingRequestError(
      response.status,
      result.message || "Billing is unavailable. Please try again.",
    );
  return result as T;
}
function useRemote<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    requestJSON<T>(path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Couldn't load billing. Try again.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, revision]);
  function reload() {
    setData(null);
    setError("");
    setLoading(true);
    setRevision((value) => value + 1);
  }
  return {
    data,
    loading: Boolean(path) && (loading || (!data && !error)),
    error,
    reload,
  };
}
function money(amount: number, currency = "usd") {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
    }).format(amount / 100);
  } catch {
    return "Amount unavailable";
  }
}
function date(value: string | null) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Date unavailable"
    : parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}
function title(value: string) {
  return value
    .replace(/[_-]/g, " ")
    .replace(/^./, (first) => first.toUpperCase());
}
function invoiceURL(value: string | null) {
  try {
    return value && new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}
function cadence(price: BillingDetails["subscriptionPrice"]) {
  if (!price) return "/ month";
  return price.intervalCount === 1
    ? `/ ${price.interval}`
    : `/ ${price.intervalCount} ${price.interval}s`;
}
function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry: () => void;
}) {
  return (
    <div className="account-notice" role="alert">
      {message}{" "}
      <button type="button" onClick={retry}>
        Try again
      </button>
    </div>
  );
}
function PaymentSummary({ details }: { details: BillingDetails | null }) {
  const method = details?.paymentMethod;
  if (!method) return <p>No default payment method on file.</p>;
  if (!method.card) return <p>{title(method.type)}</p>;
  return (
    <>
      <strong>
        {title(method.card.brand)} ending in {method.card.last4}
      </strong>
      <p>
        Expires {String(method.card.expMonth).padStart(2, "0")}/
        {method.card.expYear}
      </p>
    </>
  );
}
function DetailsSummary({ details }: { details: BillingDetails | null }) {
  const saved = details?.billingDetails;
  if (!saved || (!saved.name && !saved.email && !saved.address))
    return <p>No billing details added yet.</p>;
  const address = saved.address;
  return (
    <>
      {saved.name && <strong>{saved.name}</strong>}
      {saved.email && <p>{saved.email}</p>}
      {address && (
        <p>
          {[
            address.line1,
            address.line2,
            [address.city, address.state, address.postalCode]
              .filter(Boolean)
              .join(" "),
            address.country,
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
      )}
    </>
  );
}
async function redirectToBilling(path: string, body: object = {}) {
  const result = await requestJSON<{ url: string }>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const target = new URL(result.url);
  if (target.protocol !== "https:")
    throw new Error("The billing link could not be verified. Try again.");
  window.location.assign(target.href);
}
function PlanPrice({ plan }: { plan: Plan }) {
  return (
    <div className="account-plan-price">
      {plan.price_cents === null
        ? "Price unavailable"
        : money(plan.price_cents)}
      {plan.price_cents !== null && <small> / month</small>}
    </div>
  );
}
function PlanAllowance({ plan }: { plan: Plan }) {
  return (
    <p>
      {plan.window_3h_tokens.toLocaleString()} tokens per 3 hours
      <br />
      {plan.window_7d_tokens.toLocaleString()} tokens per 7 days
    </p>
  );
}

export function PricingPlans() {
  const plans = useRemote<{ plans: Plan[] }>("/api/billing/plans");
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const router = useRouter();
  async function checkout(plan: string) {
    if (lock.current) return;
    lock.current = true;
    setPending(plan);
    setMessage("");
    try {
      await redirectToBilling("/api/billing/checkout", { plan });
    } catch (error) {
      if (error instanceof BillingRequestError && error.status === 401)
        router.push(
          `/login?next=${encodeURIComponent("/settings/billing/upgrade")}`,
        );
      else if (
        error instanceof BillingRequestError &&
        /^You already have/.test(error.message)
      )
        router.push("/settings/billing/upgrade");
      else
        setMessage(
          error instanceof Error
            ? error.message
            : "Couldn't open checkout. Try again.",
        );
    } finally {
      lock.current = false;
      setPending(null);
    }
  }
  return (
    <section
      className="account-section"
      aria-label="Available plans"
      aria-busy={plans.loading || pending !== null}
    >
      {plans.loading && <p role="status">Loading available plans…</p>}
      {plans.error && (
        <ErrorNotice message={plans.error} retry={plans.reload} />
      )}
      {message && (
        <p className="account-notice" role="alert">
          {message}
        </p>
      )}
      {plans.data &&
        (plans.data.plans.length ? (
          <div className="account-plan-grid">
            {plans.data.plans.map((plan) => (
              <article className="account-plan-card" key={plan.id}>
                <h2>{plan.name}</h2>
                <PlanPrice plan={plan} />
                <PlanAllowance plan={plan} />
                <button
                  className="account-button"
                  type="button"
                  disabled={pending !== null || plan.price_cents === null}
                  onClick={() => checkout(plan.id)}
                >
                  {pending === plan.id
                    ? "Opening checkout…"
                    : `Choose ${plan.name}`}
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="account-notice">
            <p>No plans are currently available.</p>
            <button type="button" onClick={plans.reload}>
              Check again
            </button>
          </div>
        ))}
    </section>
  );
}

export function BillingSettings({
  offerPreview = false,
}: {
  offerPreview?: boolean;
}) {
  const billing = useRemote<BillingState>("/api/billing");
  const plans = useRemote<{ plans: Plan[] }>("/api/billing/plans");
  const details = useRemote<BillingDetails>("/api/billing/details");
  const [month, setMonth] = useState("");
  const state = billing.data;
  const subscription = state?.subscription;
  const plan = plans.data?.plans.find((item) => item.id === subscription?.plan);
  const price = details.data?.subscriptionPrice;
  const months = Array.from(
    new Set(
      state?.invoices.map((invoice) => invoice.created.slice(0, 7)) || [],
    ),
  )
    .sort()
    .reverse();
  const invoices =
    state?.invoices.filter(
      (invoice) => !month || invoice.created.slice(0, 7) === month,
    ) || [];
  return (
    <AccountShell
      title="Billing & plan"
      description="Manage your plan, payments, and invoices."
    >
      {offerPreview && <CreditBalancePreview />}
      {billing.loading && (
        <p className="account-notice" role="status">
          Loading your billing account…
        </p>
      )}
      {billing.error && (
        <ErrorNotice message={billing.error} retry={billing.reload} />
      )}
      {state && (
        <>
          <section className="account-plan-summary" aria-label="Current plan">
            <div>
              <h2>
                {subscription
                  ? plan?.name || title(subscription.plan)
                  : "No paid plan"}
              </h2>
              {subscription && (
                <div className="account-plan-price">
                  {plans.loading || details.loading
                    ? "Loading price…"
                    : price?.amount !== null && price?.amount !== undefined
                      ? money(price.amount, price.currency)
                      : plan?.price_cents !== null &&
                          plan?.price_cents !== undefined
                        ? money(plan.price_cents)
                        : "Price unavailable"}
                  <small> {cadence(price || null)}</small>
                </div>
              )}
              <p>
                {subscription
                  ? `${subscription.cancelAtPeriodEnd ? "Cancellation scheduled" : title(subscription.status)}${subscription.currentPeriodEnd ? ` · ${subscription.cancelAtPeriodEnd ? "Access ends" : subscription.active ? "Next billing date" : "Billing period ended"} ${date(subscription.currentPeriodEnd)}` : ""}`
                  : "Choose a plan when you're ready for more capacity."}
              </p>
            </div>
            <div className="account-plan-actions">
              <Link className="account-button" href="/settings/billing/upgrade">
                {subscription?.active ? "Change plan" : "Compare plans"}
              </Link>
              {state.customer && (
                <Link
                  className="account-text-link"
                  href="/settings/billing/manage"
                >
                  Manage subscription
                </Link>
              )}
            </div>
          </section>
          {plans.error && (
            <ErrorNotice
              message="Plan prices couldn't be loaded."
              retry={plans.reload}
            />
          )}
          {details.error && (
            <ErrorNotice message={details.error} retry={details.reload} />
          )}
          <section className="account-section">
            <h2>Payment method</h2>
            <div className="account-row">
              <div>
                {details.loading ? (
                  <p role="status">Loading payment method…</p>
                ) : details.error ? (
                  <p>Payment method unavailable.</p>
                ) : (
                  <PaymentSummary details={details.data} />
                )}
              </div>
              <Link
                className="account-button-secondary"
                href="/settings/billing/payment"
              >
                {details.data?.paymentMethod
                  ? "Update payment method"
                  : "Manage payment method"}
              </Link>
            </div>
          </section>
          <section className="account-section">
            <h2>Billing details</h2>
            <div className="account-row">
              <div>
                {details.loading ? (
                  <p role="status">Loading billing details…</p>
                ) : details.error ? (
                  <p>Billing details unavailable.</p>
                ) : (
                  <DetailsSummary details={details.data} />
                )}
              </div>
              <Link
                className="account-button-secondary"
                href="/settings/billing/details"
              >
                Edit details
              </Link>
            </div>
          </section>
          <section className="account-section">
            <div className="account-invoice-heading">
              <h2>Invoice history</h2>
              {months.length > 0 && (
                <label>
                  Dates
                  <select
                    value={month}
                    onChange={(event) => setMonth(event.target.value)}
                  >
                    <option value="">All recent dates</option>
                    {months.map((value) => (
                      <option key={value} value={value}>
                        {new Date(`${value}-02T12:00:00`).toLocaleDateString(
                          undefined,
                          { month: "long", year: "numeric" },
                        )}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            {!state.invoicesAvailable && state.customer ? (
              <ErrorNotice
                message="Invoices couldn't be loaded."
                retry={billing.reload}
              />
            ) : invoices.length ? (
              <>
                <p>Your most recent invoices.</p>
                <div className="account-table-wrap">
                  <table className="account-table">
                    <caption className="account-hidden">
                      Recent billing invoices
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Amount</th>
                        <th scope="col">Status</th>
                        <th scope="col">
                          <span className="account-hidden">Invoice</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice) => {
                        const url = invoiceURL(invoice.url);
                        return (
                          <tr key={invoice.id}>
                            <td>{date(invoice.created)}</td>
                            <td>{money(invoice.amount, invoice.currency)}</td>
                            <td>{title(invoice.status)}</td>
                            <td>
                              {url ? (
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`View invoice from ${date(invoice.created)} (opens in a new tab)`}
                                >
                                  View invoice
                                </a>
                              ) : (
                                "Unavailable"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p>
                {month
                  ? "No invoices for this month."
                  : "No invoices yet. Your invoices will appear here after your first payment."}
              </p>
            )}
          </section>
        </>
      )}
    </AccountShell>
  );
}

export function BillingManage({
  mode = "manage",
}: {
  mode?: "manage" | "payment" | "details";
}) {
  const billing = useRemote<BillingState>("/api/billing");
  const details = useRemote<BillingDetails>(
    mode === "manage" ? null : "/api/billing/details",
  );
  const [pending, setPending] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const subscription = billing.data?.subscription;
  async function portal() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      await redirectToBilling("/api/billing/portal");
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Couldn't open billing. Try again.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function manage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmed || lock.current) return;
    lock.current = true;
    setPending(true);
    setMessage("");
    setFailed(false);
    const withdrawing = Boolean(subscription?.cancelAtPeriodEnd);
    try {
      await requestJSON("/api/billing/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: withdrawing ? "withdraw-cancellation" : "cancel",
        }),
      });
      setConfirmed(false);
      setMessage(
        withdrawing
          ? "Cancellation withdrawn. Your subscription will continue."
          : "Cancellation scheduled for the end of your billing period.",
      );
      billing.reload();
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Couldn't update your subscription. Try again.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const heading =
    mode === "payment"
      ? "Payment method"
      : mode === "details"
        ? "Billing details"
        : "Manage subscription";
  return (
    <AccountShell
      title={heading}
      description={
        mode === "manage"
          ? "Make changes to your subscription."
          : "Review and update your billing information securely."
      }
    >
      <Link className="account-text-link" href="/settings/billing">
        Back to billing & plan
      </Link>
      {message && (
        <p className="account-notice" role={failed ? "alert" : "status"}>
          {message}
        </p>
      )}
      {billing.loading && (
        <p className="account-notice" role="status">
          Loading your billing account…
        </p>
      )}
      {billing.error && (
        <ErrorNotice message={billing.error} retry={billing.reload} />
      )}
      {details.error && (
        <ErrorNotice message={details.error} retry={details.reload} />
      )}
      {billing.data && (
        <>
          <section className="account-section">
            <h2>{mode === "manage" ? "Your subscription" : heading}</h2>
            {mode === "manage" ? (
              <p>
                {subscription
                  ? `${title(subscription.plan)} · ${subscription.cancelAtPeriodEnd ? "Cancellation scheduled" : title(subscription.status)}`
                  : "You don't have a paid subscription yet."}
              </p>
            ) : details.loading ? (
              <p role="status">Loading details…</p>
            ) : details.data ? (
              <div className="account-row">
                <div>
                  {mode === "payment" ? (
                    <PaymentSummary details={details.data} />
                  ) : (
                    <DetailsSummary details={details.data} />
                  )}
                </div>
              </div>
            ) : null}
            {billing.data.customer ? (
              <>
                <p>
                  Continue to Stripe to{" "}
                  {mode === "payment"
                    ? "add or update your payment method"
                    : mode === "details"
                      ? "update your billing name, email, or address"
                      : "review your subscription and billing settings"}
                  . You can review changes before confirming them.
                </p>
                <button
                  type="button"
                  className="account-button"
                  disabled={pending}
                  onClick={portal}
                >
                  {pending ? "Opening billing…" : "Continue to Stripe"}
                </button>
              </>
            ) : (
              <>
                <p>A billing account is created when you start checkout.</p>
                <Link
                  className="account-button"
                  href="/settings/billing/upgrade"
                >
                  Choose a plan
                </Link>
              </>
            )}
          </section>
          {mode === "manage" && subscription?.active && (
            <section className="account-section">
              <h2>
                {subscription.cancelAtPeriodEnd
                  ? "Keep your subscription"
                  : "Cancel subscription"}
              </h2>
              <p>
                {subscription.cancelAtPeriodEnd
                  ? `Your access is scheduled to end ${date(subscription.currentPeriodEnd)}. Withdraw the cancellation to keep your plan and resume renewals.`
                  : `Your access continues until ${date(subscription.currentPeriodEnd)} if you cancel. You won't be charged for the next renewal.`}
              </p>
              <form onSubmit={manage}>
                <label className="account-helper">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={pending}
                    onChange={(event) => setConfirmed(event.target.checked)}
                  />{" "}
                  {subscription.cancelAtPeriodEnd
                    ? "I want to keep my subscription and resume renewals."
                    : "I understand my paid access will end after this billing period."}
                </label>
                <div className="account-form-actions">
                  <button
                    className="account-button-secondary"
                    type="submit"
                    disabled={pending || !confirmed}
                  >
                    {pending
                      ? "Updating…"
                      : subscription.cancelAtPeriodEnd
                        ? "Withdraw cancellation"
                        : "Cancel at period end"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </>
      )}
    </AccountShell>
  );
}

export function UpgradePlans() {
  const plans = useRemote<{ plans: Plan[] }>("/api/billing/plans");
  const billing = useRemote<BillingState>("/api/billing");
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const current = billing.data?.subscription?.active
    ? billing.data.subscription.plan
    : null;
  useEffect(() => {
    if (!plans.data || !billing.data?.subscription?.active) return;
    const controller = new AbortController();
    void Promise.allSettled(
      plans.data.plans
        .filter((plan) => plan.id !== billing.data?.subscription?.plan)
        .map(async (plan) => {
          try {
            const data = await requestJSON<Preview>(
              "/api/billing/upgrade-preview",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: plan.id }),
                signal: controller.signal,
              },
            );
            if (!controller.signal.aborted)
              setPreviews((old) => ({
                ...old,
                [plan.id]: { data, loading: false },
              }));
          } catch (error) {
            if (!controller.signal.aborted)
              setPreviews((old) => ({
                ...old,
                [plan.id]: {
                  error:
                    error instanceof Error
                      ? error.message
                      : "Estimate unavailable.",
                  loading: false,
                },
              }));
          }
        }),
    );
    return () => controller.abort();
  }, [plans.data, billing.data]);
  async function retryPreview(plan: string) {
    setPreviews((old) => ({ ...old, [plan]: { loading: true } }));
    try {
      const data = await requestJSON<Preview>("/api/billing/upgrade-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      setPreviews((old) => ({ ...old, [plan]: { data, loading: false } }));
    } catch (error) {
      setPreviews((old) => ({
        ...old,
        [plan]: {
          error:
            error instanceof Error ? error.message : "Estimate unavailable.",
          loading: false,
        },
      }));
    }
  }
  async function choose(plan: string) {
    if (lock.current) return;
    lock.current = true;
    setPending(plan);
    setMessage("");
    try {
      await redirectToBilling(
        current ? "/api/billing/portal" : "/api/billing/checkout",
        { plan },
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Couldn't open billing. Try again.",
      );
    } finally {
      lock.current = false;
      setPending(null);
    }
  }
  return (
    <AccountShell
      title="Choose your plan"
      description="Find the capacity that fits your next project."
    >
      <Link className="account-text-link" href="/settings/billing">
        Back to billing & plan
      </Link>
      {message && (
        <p className="account-notice" role="alert">
          {message}
        </p>
      )}
      {(plans.loading || billing.loading) && (
        <p className="account-notice" role="status">
          Loading plans and your current subscription…
        </p>
      )}
      {plans.error && (
        <ErrorNotice message={plans.error} retry={plans.reload} />
      )}
      {billing.error && (
        <ErrorNotice message={billing.error} retry={billing.reload} />
      )}
      {plans.data && billing.data && (
        <section className="account-section" aria-label="Available plans">
          {plans.data.plans.length ? (
            <>
              <div className="account-plan-grid">
                {plans.data.plans.map((plan) => {
                  const preview = previews[plan.id];
                  return (
                    <article className="account-plan-card" key={plan.id}>
                      <h2>{plan.name}</h2>
                      <PlanPrice plan={plan} />
                      <PlanAllowance plan={plan} />
                      {plan.id === current ? (
                        <p>You&apos;re on this plan.</p>
                      ) : current ? (
                        preview?.data ? (
                          <p>
                            {preview.data.kind === "downgrade"
                              ? "Your current plan continues until the end of the billing cycle. Review the change in Stripe."
                              : preview.data.amount !== undefined
                                ? `Estimated amount due today: ${money(preview.data.amount, preview.data.currency)}. The final amount is shown in Stripe.`
                                : "Review the final amount in Stripe."}
                          </p>
                        ) : preview?.error ? (
                          <div className="account-notice">
                            <p>
                              Estimate unavailable. Stripe will show the amount
                              before you confirm.
                            </p>
                            <button
                              type="button"
                              disabled={pending !== null}
                              onClick={() => retryPreview(plan.id)}
                            >
                              Retry estimate
                            </button>
                          </div>
                        ) : (
                          <p role="status">Calculating your change…</p>
                        )
                      ) : null}
                      <button
                        className="account-button"
                        type="button"
                        disabled={
                          pending !== null ||
                          plan.id === current ||
                          plan.price_cents === null
                        }
                        onClick={() => choose(plan.id)}
                      >
                        {plan.id === current
                          ? "Current plan"
                          : pending === plan.id
                            ? "Opening billing…"
                            : `Choose ${plan.name}`}
                      </button>
                    </article>
                  );
                })}
              </div>
              <p className="account-helper">
                Plan changes and any amount due are confirmed in Stripe before
                payment.
              </p>
            </>
          ) : (
            <div className="account-notice">
              <p>No plans are currently available.</p>
              <button type="button" onClick={plans.reload}>
                Check again
              </button>
            </div>
          )}
        </section>
      )}
    </AccountShell>
  );
}
