import Link from "next/link";
import { customerAccount } from "@/lib/customer-account";
import { CustomerHeader } from "./customer-header";
import { CustomerFooter } from "./customer-footer";
import "./account.css";
import styles from "./support-page.module.css";

const topics = [
  {
    title: "Your account",
    description:
      "Update your name and photo, download account details, or manage notification preferences.",
    href: "/settings",
    action: "Open account settings",
  },
  {
    title: "Sign-in & security",
    description:
      "Manage your email password, authenticator app, and access on other devices.",
    href: "/settings/security",
    action: "Open security settings",
  },
  {
    title: "Billing & payments",
    description:
      "Review your subscription and invoices, update payment details, or change your plan.",
    href: "/settings/billing",
    action: "Open billing & plan",
  },
] as const;

export async function SupportPage() {
  const account = await customerAccount();
  const email = process.env.RUNLY_SUPPORT_EMAIL?.trim();
  const contactEmail =
    email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  return (
    <div className="customer-account customer-marketing-morph">
      <CustomerHeader account={account} morphOnScroll />
      <main id="customer-content" className={styles.main}>
        <header className={styles.heading}>
          <p>Support</p>
          <h1>
            A little help.
            <br />
            <em>Keep your idea moving.</em>
          </h1>
          <p>Find an answer or go straight to the settings you need.</p>
        </header>
        <section aria-labelledby="support-topics" className={styles.topics}>
          <h2 id="support-topics">What do you need help with?</h2>
          <div className={styles.topicGrid}>
            {topics.map((topic) => (
              <article key={topic.href}>
                <h3>{topic.title}</h3>
                <p>{topic.description}</p>
                <Link href={topic.href}>
                  {topic.action} <span aria-hidden="true">↗</span>
                </Link>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.answers} aria-labelledby="support-answers">
          <h2 id="support-answers">A few common questions</h2>
          <details>
            <summary>I can’t sign in. What should I do?</summary>
            <p>
              Use the email address on your account. If you’ve forgotten your
              password, request a reset link. Accounts with two-step
              verification also need a code from their authenticator app.
            </p>
            <Link href="/forgot-password">Reset your password</Link>
          </details>
          <details>
            <summary>How do I change or cancel my plan?</summary>
            <p>
              Open Billing & plan, then choose Change plan or Manage
              subscription. Review any amount due before confirming a plan
              change. When you cancel, access continues through the current
              billing period.
            </p>
            <Link href="/settings/billing">Manage your plan</Link>
          </details>
          <details>
            <summary>Where can I find my invoices?</summary>
            <p>
              Invoice history appears in Billing & plan after your first
              payment. Open an invoice to view its details and download a
              receipt through Stripe.
            </p>
            <Link href="/settings/billing">View billing history</Link>
          </details>
          <details>
            <summary>What can I create with Runly?</summary>
            <p>
              Start with a website or app idea, or plan the story, script, and
              sequence for a video. Describe what you have in mind and refine it
              through a conversation.
            </p>
            <Link href="/create">Start creating</Link>
          </details>
          <details>
            <summary>How do I download my account data?</summary>
            <p>
              In your profile, choose Download account data. The JSON file
              includes account details and project metadata. It does not include
              project files.
            </p>
            <Link href="/settings">Open your profile</Link>
          </details>
          <details>
            <summary>How do I request account deletion?</summary>
            <p>
              Open Security and choose Request deletion. Requests are reviewed
              before data is removed. You can cancel a pending request from the
              same page; submitting one does not immediately cancel billing.
            </p>
            <Link href="/settings/security/delete">
              Request account deletion
            </Link>
          </details>
        </section>
        {contactEmail && (
          <section className={styles.contact}>
            <div>
              <h2>Still need a hand?</h2>
              <p>
                Tell us what happened and include the page you were using.
                Please leave out passwords, authenticator codes, and payment
                card details.
              </p>
            </div>
            <a href={`mailto:${contactEmail}`}>Contact support ↗</a>
          </section>
        )}
      </main>
      <CustomerFooter />
    </div>
  );
}
