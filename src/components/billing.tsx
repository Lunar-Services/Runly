"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AppShell } from "./app-shell";

const invoiceMonths = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const fallbackPlans = [
  {
    id: "standard",
    name: "Standard",
    price: "$3",
    allowance: "100k / 3h · 600k / 7d",
  },
  { id: "pro", name: "Pro", price: "$9", allowance: "350k / 3h · 2m / 7d" },
  {
    id: "cowork",
    name: "Cowork",
    price: "$19",
    allowance: "1m / 3h · 5m / 7d shared",
  },
] as const;

type Plan = { id: string; name: string; price: string; allowance: string };
type Invoice = {
  id: string;
  created: string;
  kind: "subscription" | "upgrade";
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

function formatInvoiceAmount(amount: number, currency: string) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

async function redirectToBilling(path: string, body?: object) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.message || "Billing is unavailable. Please try again.",
    );
  window.location.assign(result.url);
}

export function PricingPlans() {
  const [plans, setPlans] = useState<Plan[]>([...fallbackPlans]);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetch("/api/billing/plans")
      .then(async (response) => {
        if (!response.ok) return null;
        return response.json();
      })
      .then((data) => {
        if (!data?.plans?.length) return;
        setPlans(
          data.plans.map(
            (plan: {
              id: string;
              name: string;
              price_cents: number | null;
              window_3h_tokens: number;
              window_7d_tokens: number;
            }) => ({
              id: plan.id,
              name: plan.name,
              price:
                plan.price_cents === null
                  ? "—"
                  : `$${(plan.price_cents / 100).toLocaleString()}`,
              allowance: `${Math.round(plan.window_3h_tokens / 1000)}k / 3h · ${Math.round(plan.window_7d_tokens / 1000)}k / 7d`,
            }),
          ),
        );
      })
      .catch(() => undefined);
  }, []);
  async function checkout(plan: string) {
    setPending(plan);
    setFailed(false);
    setMessage("");
    try {
      await redirectToBilling("/api/billing/checkout", { plan });
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Billing is unavailable. Please try again.",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <>
      <div className="price-grid standalone-prices">
        {plans.map((plan) => (
          <article className="price-card" key={plan.id}>
            <h3>{plan.name}</h3>
            <div className="price">
              <strong>{plan.price}</strong>
              <span>/ month</span>
            </div>
            <p>{plan.allowance}</p>
            <button
              className="button button-outline full"
              disabled={pending !== null}
              onClick={() => checkout(plan.id)}
            >
              {pending === plan.id
                ? "Opening checkout…"
                : `Choose ${plan.name}`}
            </button>
          </article>
        ))}
      </div>
      {message && (
        <p
          className="inline-notice billing-notice"
          role={failed ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </>
  );
}

export function BillingSettings() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<BillingState | null>(null);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [invoiceMonth, setInvoiceMonth] = useState("");
  const [invoicePickerOpen, setInvoicePickerOpen] = useState(false);
  const pickerYear = invoiceMonth
    ? Number(invoiceMonth.slice(0, 4))
    : new Date().getFullYear();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/billing", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        return data;
      })
      .then(setState)
      .catch(
        (error) =>
          !controller.signal.aborted &&
          setMessage(error.message || "Couldn't load billing."),
      );
    return () => controller.abort();
  }, []);
  async function manage(action: "cancel" | "withdraw-cancellation") {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/billing/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      const refreshed = await fetch("/api/billing");
      setState(await refreshed.json());
      dialog.current?.close();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Billing is unavailable.",
      );
    } finally {
      setPending(false);
    }
  }
  const subscription = state?.subscription;
  const filteredInvoices = state?.invoices.filter(
    (invoice) => !invoiceMonth || invoice.created.slice(0, 7) === invoiceMonth,
  );
  return (
    <AppShell title="Billing">
      <div className="settings-grid">
        <section className="panel form-panel">
          <h2>Subscription</h2>
          {!state ? (
            <p className="muted">Loading your billing account…</p>
          ) : subscription ? (
            <>
              <div className="status-row billing-status-row">
                <div>
                  <p>Current plan</p>
                  <strong className="billing-plan-name">
                    {subscription.plan[0]?.toUpperCase()}
                    {subscription.plan.slice(1)}
                  </strong>
                  <small className="billing-period">
                    {subscription.currentPeriodEnd
                      ? `${subscription.cancelAtPeriodEnd ? "Ends" : "Next billing"} ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                      : "Billing date unavailable"}
                  </small>
                </div>
                <span
                  className={
                    subscription.cancelAtPeriodEnd
                      ? "billing-ending-badge"
                      : subscription.active
                        ? "billing-active-badge"
                        : "danger-badge"
                  }
                >
                  {subscription.cancelAtPeriodEnd
                    ? "Ending"
                    : subscription.active
                      ? "Active"
                      : subscription.status}
                </span>
              </div>
              <div className="button-row billing-actions">
                <button
                  className="button button-dark"
                  onClick={() => dialog.current?.showModal()}
                  disabled={pending}
                >
                  Manage billing
                </button>
                {!subscription.cancelAtPeriodEnd && (
                  <button
                    className="button button-outline"
                    onClick={() =>
                      window.location.assign("/settings/billing/upgrade")
                    }
                    disabled={pending}
                  >
                    Upgrade plan
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                Choose a plan to unlock usage allowances. Subscription status is
                confirmed by Stripe webhooks.
              </p>
              <Link className="button button-dark" href="/pricing">
                Compare plans
              </Link>
            </>
          )}
        </section>
        <section className="panel billing-invoices">
          <div className="invoice-header">
            <h2>Invoices</h2>
            <div className="invoice-date-filter">
              <span>Date</span>
              <div className="invoice-picker">
                <button
                  className="invoice-picker-trigger"
                  type="button"
                  aria-expanded={invoicePickerOpen}
                  aria-label="Filter invoices by month"
                  onClick={() => setInvoicePickerOpen((open) => !open)}
                >
                  {invoiceMonth
                    ? `${invoiceMonths[Number(invoiceMonth.slice(5, 7)) - 1]} ${invoiceMonth.slice(0, 4)}`
                    : "All dates"}
                  <span className="invoice-picker-chevron" aria-hidden="true" />
                </button>
                {invoicePickerOpen && (
                  <div className="invoice-picker-popover">
                    <select
                      aria-label="Invoice year"
                      value={pickerYear}
                      onChange={(event) => {
                        const month = invoiceMonth
                          ? invoiceMonth.slice(5, 7)
                          : "01";
                        setInvoiceMonth(`${event.target.value}-${month}`);
                      }}
                    >
                      {Array.from({ length: 11 }, (_, index) => {
                        const year = new Date().getFullYear() - 5 + index;
                        return (
                          <option key={year} value={year}>
                            {year}
                          </option>
                        );
                      })}
                    </select>
                    <div className="invoice-month-grid">
                      {invoiceMonths.map((month, index) => {
                        const value = `${pickerYear}-${String(index + 1).padStart(2, "0")}`;
                        return (
                          <button
                            className={
                              invoiceMonth === value ? "selected" : undefined
                            }
                            key={month}
                            type="button"
                            onClick={() => {
                              setInvoiceMonth(value);
                              setInvoicePickerOpen(false);
                            }}
                          >
                            {month}
                          </button>
                        );
                      })}
                    </div>
                    <div className="invoice-picker-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setInvoiceMonth("");
                          setInvoicePickerOpen(false);
                        }}
                      >
                        Clear
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          setInvoiceMonth(
                            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
                          );
                          setInvoicePickerOpen(false);
                        }}
                      >
                        This month
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {!state ? (
            <p className="muted">Loading invoices…</p>
          ) : filteredInvoices?.length ? (
            <div className="invoice-list">
              {filteredInvoices.map((invoice) => (
                <div className="invoice-row" key={invoice.id}>
                  <span>
                    <strong>
                      {new Date(invoice.created).toLocaleDateString()}
                    </strong>
                    <small>
                      {invoice.kind === "upgrade"
                        ? "Prorated upgrade"
                        : "Subscription Paid"}
                      {` · ${invoice.status}`}
                    </small>
                  </span>
                  <span className="invoice-amount">
                    {formatInvoiceAmount(invoice.amount, invoice.currency)}
                  </span>
                  {invoice.url && (
                    <a href={invoice.url} target="_blank" rel="noreferrer">
                      View
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              {invoiceMonth
                ? "No invoices found for this month."
                : state.invoicesAvailable
                  ? "No invoices yet."
                  : "Invoices appear after billing is connected."}
            </p>
          )}
        </section>
      </div>
      {message && (
        <p className="inline-notice billing-notice" role="alert">
          {message}
        </p>
      )}
      <dialog
        ref={dialog}
        className="runly-dialog billing-dialog"
        aria-labelledby="billing-dialog-title"
      >
        <h2 id="billing-dialog-title">Manage billing</h2>
        <p className="muted">Changes are verified and processed by Stripe.</p>
        <section className="billing-dialog-section">
          <h3>Update Billing Information</h3>
          <p className="muted">
            Stripe handles plan changes, prorating, payment, and any required
            verification.
          </p>
          <button
            className="button button-dark"
            disabled={pending}
            onClick={() => redirectToBilling("/api/billing/portal")}
          >
            Update Billing Information
          </button>
        </section>
        <section className="billing-dialog-section billing-cancel-section">
          <h3>
            {subscription?.cancelAtPeriodEnd
              ? "Cancellation scheduled"
              : "Cancel plan"}
          </h3>
          <p className="muted">
            {subscription?.cancelAtPeriodEnd
              ? "Your plan remains active through the current billing period. You can withdraw the cancellation any time before then."
              : "Your access remains active through the current billing period."}
          </p>
          <button
            className={
              subscription?.cancelAtPeriodEnd
                ? "button button-dark"
                : "button button-outline"
            }
            disabled={pending}
            onClick={() =>
              manage(
                subscription?.cancelAtPeriodEnd
                  ? "withdraw-cancellation"
                  : "cancel",
              )
            }
          >
            {subscription?.cancelAtPeriodEnd
              ? "Withdraw cancellation"
              : "Cancel at period end"}
          </button>
        </section>
        <div className="button-row">
          <button
            className="button button-outline"
            onClick={() => dialog.current?.close()}
            disabled={pending}
          >
            Close
          </button>
        </div>
      </dialog>
    </AppShell>
  );
}

export function UpgradePlans() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [previews, setPreviews] = useState<
    Record<string, { kind: "upgrade" | "downgrade"; amount?: string }>
  >({});
  const [current, setCurrent] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([fetch("/api/billing/plans"), fetch("/api/billing")])
      .then(async ([p, b]) => {
        const pd = await p.json();
        const bd = await b.json();
        const loaded = (pd.plans ?? []).map(
          (x: { id: string; name: string; price_cents: number | null }) => ({
            id: x.id,
            name: x.name,
            price: x.price_cents === null ? "—" : `$${x.price_cents / 100}`,
            allowance: "",
          }),
        );
        setPlans(loaded);
        setCurrent(bd.subscription?.plan ?? null);
        loaded
          .filter((plan: Plan) => plan.id !== bd.subscription?.plan)
          .forEach((plan: Plan) =>
            fetch("/api/billing/upgrade-preview", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ plan: plan.id }),
            })
              .then((response) => (response.ok ? response.json() : null))
              .then(
                (preview) =>
                  preview &&
                  setPreviews((old) => ({
                    ...old,
                    [plan.id]:
                      preview.kind === "downgrade"
                        ? { kind: "downgrade" }
                        : {
                            kind: "upgrade",
                            amount: new Intl.NumberFormat(undefined, {
                              style: "currency",
                              currency: preview.currency.toUpperCase(),
                            }).format(preview.amount / 100),
                          },
                  })),
              )
              .catch(() => undefined),
          );
      })
      .catch(() => undefined);
  }, []);
  const currentPlanName =
    plans.find((plan) => plan.id === current)?.name ?? "current plan";
  return (
    <AppShell title="Upgrade your plan">
      <div className="price-grid standalone-prices">
        {plans.map((plan) => (
          <article className="price-card" key={plan.id}>
            <h3>{plan.name}</h3>
            <div className="price">
              <strong>{plan.price}</strong>
              <span>/ month</span>
            </div>
            {plan.id !== current && previews[plan.id]?.kind === "upgrade" && (
              <p>
                <em>Amount due today: {previews[plan.id].amount}</em>
              </p>
            )}
            {plan.id !== current && previews[plan.id]?.kind === "downgrade" && (
              <p>
                <em>
                  You will retain your {currentPlanName} perks until end of
                  billing cycle
                </em>
              </p>
            )}
            <button
              className="button button-outline full"
              disabled={pending !== null || plan.id === current}
              onClick={async () => {
                setPending(plan.id);
                await redirectToBilling("/api/billing/portal", {
                  plan: plan.id,
                });
              }}
            >
              {plan.id === current
                ? "Current plan"
                : pending === plan.id
                  ? "Opening Stripe…"
                  : previews[plan.id]?.kind === "downgrade"
                    ? "Downgrade"
                    : "Upgrade"}
            </button>
          </article>
        ))}
      </div>
    </AppShell>
  );
}
