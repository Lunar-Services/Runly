"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "./app-shell";

type CatalogPlan = {
  id: string;
  name: string;
  active: boolean;
  price_cents: number | null;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
  window_3h_tokens: number;
  window_7d_tokens: number;
  project_cap: number | null;
};

const blank = {
  id: "",
  name: "",
  stripeProductId: "",
  stripePriceId: "",
  window3hTokens: "100000",
  window7dTokens: "600000",
  projectCap: "",
  active: true,
};

export function AdminBillingPlans() {
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [form, setForm] = useState(blank);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("Loading product catalog…");
  const [failed, setFailed] = useState(false);
  async function load() {
    const response = await fetch("/api/admin/plans");
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.message || "Couldn't load products.");
    setPlans(data.plans);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/plans", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "Couldn't load products.");
        return data;
      })
      .then((data) => {
        setPlans(data.plans);
        setMessage("");
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setFailed(true);
        setMessage(error.message || "Couldn't load products.");
      });
    return () => controller.abort();
  }, []);
  function edit(plan: CatalogPlan) {
    setForm({
      id: plan.id,
      name: plan.name,
      stripeProductId: plan.stripe_product_id || "",
      stripePriceId: plan.stripe_price_id || "",
      window3hTokens: String(plan.window_3h_tokens),
      window7dTokens: String(plan.window_7d_tokens),
      projectCap: plan.project_cap === null ? "" : String(plan.project_cap),
      active: plan.active,
    });
    setFailed(false);
    setMessage(`Editing ${plan.name}.`);
  }
  async function togglePlan(plan: CatalogPlan) {
    setPending(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch("/api/admin/plans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: plan.id, active: !plan.active }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Couldn't update the product status.");
      setPlans((current) =>
        current.map((item) =>
          item.id === plan.id ? { ...item, active: data.plan.active } : item,
        ),
      );
      setForm((current) =>
        current.id === plan.id
          ? { ...current, active: data.plan.active }
          : current,
      );
      setMessage(
        `${plan.name} is now ${data.plan.active ? "active" : "inactive"}.`,
      );
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Couldn't update the product status.",
      );
    } finally {
      setPending(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          window3hTokens: Number(form.window3hTokens),
          window7dTokens: Number(form.window7dTokens),
          projectCap: form.projectCap ? Number(form.projectCap) : null,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Couldn't save product.");
      await load();
      setForm(blank);
      setMessage("Product saved and verified with Stripe.");
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error ? error.message : "Couldn't save product.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <AppShell title="Billing catalog" eyebrow="Super admin">
      <div className="settings-grid admin-catalog-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Registered products</h2>
              <p>Only active plans appear at Checkout.</p>
            </div>
            <button
              className="button button-outline"
              onClick={() => setForm(blank)}
            >
              New product
            </button>
          </div>
          <div className="catalog-list">
            {plans.map((plan) => (
              <div className="catalog-item" key={plan.id}>
                <button
                  className="catalog-item-details"
                  type="button"
                  onClick={() => edit(plan)}
                >
                  <strong>{plan.name}</strong>
                  <small>
                    {plan.id} ·{" "}
                    {plan.stripe_product_id || "Stripe Product not set"}
                  </small>
                </button>
                <button
                  className="catalog-status-toggle"
                  type="button"
                  role="switch"
                  aria-checked={plan.active}
                  aria-label={`${plan.active ? "Deactivate" : "Activate"} ${plan.name}`}
                  disabled={pending}
                  onClick={() => togglePlan(plan)}
                >
                  <span className="catalog-status-track" aria-hidden="true">
                    <span />
                  </span>
                  <span>{plan.active ? "Active" : "Inactive"}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="panel form-panel">
          <h2>{form.id ? "Edit product" : "Register product"}</h2>
          <p className="muted">
            Runly verifies the exact Stripe Price before it can be offered to
            customers.
          </p>
          <form className="profile-form" onSubmit={save} noValidate>
            <label>
              Plan ID
              <input
                value={form.id}
                onChange={(event) =>
                  setForm({ ...form, id: event.target.value.toLowerCase() })
                }
                placeholder="team"
                maxLength={63}
                disabled={
                  pending || Boolean(plans.find((plan) => plan.id === form.id))
                }
                required
              />
            </label>
            <label>
              Display name
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
                placeholder="Team"
                maxLength={80}
                disabled={pending}
                required
              />
            </label>
            <label>
              Stripe Product ID
              <input
                value={form.stripeProductId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    stripeProductId: event.target.value.trim(),
                  })
                }
                placeholder="prod_..."
                disabled={pending}
                required
              />
            </label>
            <label>
              Stripe monthly Price ID
              <input
                value={form.stripePriceId}
                onChange={(event) =>
                  setForm({ ...form, stripePriceId: event.target.value.trim() })
                }
                placeholder="price_..."
                disabled={pending}
                required
              />
            </label>
            <div className="catalog-quotas">
              <label>
                3-hour tokens
                <input
                  inputMode="numeric"
                  value={form.window3hTokens}
                  onChange={(event) =>
                    setForm({ ...form, window3hTokens: event.target.value })
                  }
                  disabled={pending}
                  required
                />
              </label>
              <label>
                7-day tokens
                <input
                  inputMode="numeric"
                  value={form.window7dTokens}
                  onChange={(event) =>
                    setForm({ ...form, window7dTokens: event.target.value })
                  }
                  disabled={pending}
                  required
                />
              </label>
            </div>
            <label>
              Project cap <span className="muted">(optional)</span>
              <input
                inputMode="numeric"
                value={form.projectCap}
                onChange={(event) =>
                  setForm({ ...form, projectCap: event.target.value })
                }
                disabled={pending}
              />
            </label>
            <label className="catalog-toggle">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) =>
                  setForm({ ...form, active: event.target.checked })
                }
                disabled={pending}
              />
              Offer this plan at Checkout
            </label>
            <button className="button button-dark" disabled={pending}>
              {pending ? "Verifying…" : "Verify & save product"}
            </button>
          </form>
          {message && (
            <p className="inline-notice" role={failed ? "alert" : "status"}>
              {message}
            </p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
