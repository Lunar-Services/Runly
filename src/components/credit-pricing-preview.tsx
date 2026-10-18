import Link from "next/link";
import Image from "next/image";
import styles from "./credit-pricing-preview.module.css";

const proposedPlans = [
  {
    name: "Standard",
    price: "$9",
    cadence: "/ month",
    description: "For smaller ideas and occasional builds.",
    hours: "3 AI Workspace Hours / week",
    storage: "2 GB saved files",
  },
  {
    name: "Plus",
    price: "$19",
    cadence: "/ month",
    description: "For your next creative chapter.",
    hours: "10 AI Workspace Hours / week",
    storage: "5 GB saved files",
  },
  {
    name: "Pro",
    price: "$49",
    cadence: "/ month",
    description: "More room for bigger ideas.",
    hours: "30 AI Workspace Hours / week",
    storage: "20 GB saved files",
  },
] as const;

function PreviewNote({ balance = false }: { balance?: boolean }) {
  return (
    <div className={`account-notice ${styles.note}`} role="note">
      <strong>{balance ? "Sample credit balances" : "Proposed pricing"}</strong>
      <p>
        {balance
          ? "Illustrative values for proposed plans, which are not available at checkout. These are not your account balances."
          : "Draft prices and allowances for review. Not available at checkout."}
      </p>
    </div>
  );
}

export function CreditPricingPreview() {
  return (
    <section
      className={`account-section ${styles.preview}`}
      aria-labelledby="credit-pricing-title"
    >
      <header className={styles.heading}>
        <h2 id="credit-pricing-title">Plans for your next project</h2>
        <p>Choose your workspace time. AI is included.</p>
      </header>

      <div className={styles.planGrid}>
        {proposedPlans.map((plan) => (
          <article
            className={`${styles.planCard} ${plan.name === "Plus" ? styles.featured : ""}`}
            key={plan.name}
          >
            <div className={styles.planHeader}>
              <h3 className={styles.planTitle}>{plan.name}</h3>
              {plan.name === "Plus" && (
                <small className={styles.recommended}>Recommended</small>
              )}
            </div>
            <p className={styles.planDescription}>{plan.description}</p>
            <div className={styles.price}>
              {plan.price}
              <small> {plan.cadence}</small>
            </div>
            <ul className={styles.features}>
              {[
                plan.hours,
                "AI included",
                "Code execution & live previews",
                plan.storage,
                "1 workspace",
              ].map((feature) => (
                <li key={feature}>
                  <Image
                    src={`/figma/pricing/check${plan.name === "Plus" ? "-featured" : ""}.svg`}
                    width={17}
                    height={17}
                    alt=""
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <Link
              className={styles.planButton}
              href="/settings/billing"
              aria-label={`View billing for ${plan.name}`}
            >
              View billing
            </Link>
          </article>
        ))}
      </div>

      <section className={styles.payg} aria-labelledby="payg-title">
        <div className={styles.paygIntro}>
          <h3 id="payg-title">Pay as you go</h3>
          <p>No subscription. Top up when you need to.</p>
          <div className={styles.paygPrice}>
            $10 <small>/ top-up</small>
          </div>
        </div>
        <ul className={styles.paygFeatures}>
          <li>
            5 AI Workspace Hours
            <small>Per purchase. Valid for 30 days.</small>
          </li>
          <li>AI, code execution & live previews included</li>
          <li>2 GB saved files · 1 workspace</li>
        </ul>
        <Link className={styles.paygButton} href="/settings/billing">
          View top-ups
        </Link>
      </section>

      <section
        className={styles.faq}
        aria-labelledby="credit-pricing-faq-title"
      >
        <h3 id="credit-pricing-faq-title">A few things to know</h3>
        <details>
          <summary>What is included in a workspace hour?</summary>
          <p>
            AI assistance with all supported models, code execution, and live
            previews. Each user has one workspace with one development sandbox.
            There are no separate AI or GPU charges. Production hosting is not
            included.
          </p>
        </details>
        <details>
          <summary>When does the timer run?</summary>
          <p>
            Time starts when your development runtime is ready and counts while
            it is running, including builds and live previews. It pauses when
            your sandbox sleeps. Waiting for GPU provisioning does not use your
            hours. Saved files and manual editing while the runtime is asleep do
            not use time.
          </p>
        </details>
        <details>
          <summary>When do weekly allowances renew?</summary>
          <p>
            Subscribers receive four allowances per monthly billing cycle: at
            subscription start, then 7, 14, and 21 days later. The fourth period
            lasts until the next monthly renewal. Unused subscription hours
            expire at the next release and do not roll over. Top-ups are per
            purchase, not recurring grants, and expire 30 days after purchase.
          </p>
        </details>
        <details>
          <summary>Are there limits on AI usage?</summary>
          <p>
            Send prompts during your active hours without a separate usage
            charge. Fair-use, request, and capacity limits apply to keep shared
            models responsive. If your hours run out, add a top-up to continue.
            There are no automatic overages.
          </p>
        </details>
      </section>

      <div className={styles.links}>
        <Link
          className="account-button-secondary"
          href="/dashboard/projects/new"
        >
          Explore workspace
        </Link>
      </div>
    </section>
  );
}

export function CreditBalancePreview() {
  return (
    <section
      className={`account-section ${styles.preview}`}
      aria-labelledby="credit-balance-title"
    >
      <h2 id="credit-balance-title">Credit balance preview</h2>
      <PreviewNote balance />
      <dl className={styles.balanceGrid}>
        <div className={styles.balanceRow}>
          <dt>
            Monthly credits <span>Standard example</span>
          </dt>
          <dd>
            1,000 <small>credits</small>
            <p>Reset each billing period. Used first.</p>
          </dd>
        </div>
        <div className={styles.balanceRow}>
          <dt>
            Prepaid credits <span>Pay as you go example</span>
          </dt>
          <dd>
            1,000 <small>credits</small>
            <p>No monthly expiry. Used after monthly credits.</p>
          </dd>
        </div>
      </dl>
      <p className="account-helper">
        Sample layout for monthly and prepaid usage. No credit purchases are
        enabled.
      </p>
      <div className={styles.links}>
        <Link className="account-button-secondary" href="/pricing">
          View current plans
        </Link>
      </div>
    </section>
  );
}
