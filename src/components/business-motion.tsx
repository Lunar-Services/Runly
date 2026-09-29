"use client";

import { useState } from "react";
import NumberFlow from "@number-flow/react";
import { Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";

const plans = [
  { id: "standard", name: "Standard", price: 3, tokens: 100000 },
  { id: "pro", name: "Pro", price: 9, tokens: 350000 },
  { id: "cowork", name: "Cowork", price: 19, tokens: 1000000 },
];
const timing = { duration: 250, easing: "cubic-bezier(.2,.8,.2,1)" };

export function PlanComparison({
  initialPlan = "standard",
  initialMonths = 1,
}: {
  initialPlan?: string;
  initialMonths?: number;
}) {
  const router = useRouter();
  const initialPlanIndex = plans.findIndex((item) => item.id === initialPlan);
  const [selected, setSelected] = useState(
    initialPlanIndex >= 0 ? initialPlanIndex : 0,
  );
  const [months, setMonths] = useState(
    Number.isInteger(initialMonths) && initialMonths >= 1 && initialMonths <= 12
      ? initialMonths
      : 1,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const plan = plans[selected];

  async function checkout() {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.id, months }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (response.status === 401) {
        const next = `/?plan=${plan.id}&months=${months}#pricing`;
        router.push(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      if (!response.ok)
        throw new Error(result.message || "Checkout is unavailable right now.");
      window.location.assign(result.url);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Checkout is unavailable right now.",
      );
      setPending(false);
    }
  }
  return (
    <section className="plan-comparison" aria-label="Plan cost estimator">
      <div className="plan-switch" role="group" aria-label="Select a plan">
        <span
          className="plan-switch-indicator"
          style={{ transform: `translateX(${selected * 100}%)` }}
          aria-hidden="true"
        />
        {plans.map((item, index) => (
          <button
            key={item.name}
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="estimate-content">
        <div>
          <p>
            Estimated cost for {months === 1 ? "one month" : `${months} months`}
          </p>
          <NumberFlow
            value={plan.price * months}
            format={{
              style: "currency",
              currency: "USD",
              maximumFractionDigits: 0,
            }}
            transformTiming={timing}
            opacityTiming={{ duration: 150 }}
          />
          <small>
            {plan.tokens.toLocaleString("en-US")} tokens per 3-hour window
          </small>
        </div>
        <div>
          <label htmlFor="estimate-months">Subscription length</label>
          <div className="month-stepper">
            <button
              aria-label="One fewer month"
              disabled={months === 1}
              onClick={() => setMonths((value) => value - 1)}
            >
              <Minus size={20} />
            </button>
            <input
              id="estimate-months"
              type="number"
              inputMode="numeric"
              min={1}
              max={12}
              value={months}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 1 && value <= 12)
                  setMonths(value);
              }}
            />
            <button
              aria-label="One more month"
              disabled={months === 12}
              onClick={() => setMonths((value) => value + 1)}
            >
              <Plus size={20} />
            </button>
          </div>
        </div>
      </div>
      <div className="estimate-checkout">
        <p className="estimate-note">
          Billed monthly at ${plan.price} for {months}{" "}
          {months === 1 ? "month" : "months"}, then ends automatically. No
          annual discount.
        </p>
        <button
          className="button button-dark"
          type="button"
          disabled={pending}
          onClick={checkout}
        >
          {pending ? "Opening secure checkout…" : `Buy ${plan.name}`}
        </button>
      </div>
      {message && (
        <p className="inline-notice estimate-error" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}

const examples = [
  {
    category: "Independent studio",
    title: "A clearer first impression.",
    body: "A portfolio that explains your services, shows your work, and gives clients a place to enquire.",
  },
  {
    category: "Local business",
    title: "Make the next step obvious.",
    body: "An online home for your opening hours, services, and booking information.",
  },
  {
    category: "Digital product",
    title: "Start with one useful thing.",
    body: "A focused tool that helps a particular customer solve a particular problem.",
  },
  {
    category: "Small team",
    title: "Less scattered work.",
    body: "A client portal concept for requests, project updates, and shared resources.",
  },
];

export function BusinessMotion() {
  return (
    <section
      className="business-motion"
      aria-labelledby="business-examples-title"
    >
      <div className="business-heading">
        <div>
          <h2 id="business-examples-title">
            Small beginnings.
            <br />
            Real possibilities.
          </h2>
          <p>
            Illustrative business ideas—not customer reviews or completed Runly
            projects.
          </p>
        </div>
      </div>
      <div className="business-marquee">
        <div className="business-track">
          {[0, 1].map((copy) => (
            <div className="business-group" key={copy} aria-hidden={copy === 1}>
              {examples.map((example) => (
                <article key={example.category}>
                  <span>{example.category}</span>
                  <h3>{example.title}</h3>
                  <p>{example.body}</p>
                </article>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div
        className="business-type"
        aria-label="Turn an idea into your next chapter"
      >
        <div aria-hidden="true">
          <span>Turn an idea into your next chapter.  </span>
          <span>Turn an idea into your next chapter.  </span>
        </div>
        <div aria-hidden="true">
          <span>Make something worth sharing.  </span>
          <span>Make something worth sharing.  </span>
        </div>
      </div>
    </section>
  );
}
