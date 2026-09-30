"use client";
import { useId, useState } from "react";
import styles from "./runly-faq.module.css";
const questions = [
  {
    question: "What is Runly?",
    answer:
      "Runly is an AI-powered software creation platform built to help people turn ideas into real products faster.",
    category: "Getting started",
  },
  {
    question: "Who is Runly for?",
    answer:
      "Runly is for developers, founders, students, creators, startups, teams, and anyone who wants to build software.",
    category: "Getting started",
  },
  {
    question: "Do I need coding experience?",
    answer:
      "No. Runly is designed to work for both beginners and experienced developers.",
    category: "Getting started",
  },
  {
    question: "What can I make with Runly?",
    answer:
      "You can use Runly for websites, web apps, SaaS products, dashboards, bots, APIs, automations, scripts, internal tools, and other software projects.",
    category: "Getting started",
  },
  {
    question: "Is Runly just an AI chatbot?",
    answer:
      "No. Runly is built around projects and software creation rather than being a general-purpose chat experience.",
    category: "Getting started",
  },
  {
    question: "Who operates Runly?",
    answer: "Runly is built and operated by Lunar Group.",
    category: "Getting started",
  },
  {
    question: "Is Runly still in development?",
    answer:
      "Yes. Runly is actively being improved, so features, limits, and parts of the platform may change over time.",
    category: "Getting started",
  },
  {
    question: "Do I need an account?",
    answer:
      "Yes. An account is required to save projects, manage your subscription, track usage, and access your workspace.",
    category: "Getting started",
  },
  {
    question: "Can I use Runly for free?",
    answer:
      "Runly may offer free access, trials, beta access, or promotional plans depending on what is currently available.",
    category: "Plans & billing",
  },
  {
    question: "What plans does Runly offer?",
    answer:
      "Runly offers different plans with different usage limits and features. Current pricing and plan details are shown on the pricing page.",
    category: "Plans & billing",
  },
  {
    question: "Is Runly a subscription?",
    answer:
      "Current plans are billed monthly for a one-month term, then end automatically. Check the plan details at checkout.",
    category: "Plans & billing",
  },
  {
    question: "Does my subscription renew automatically?",
    answer:
      "Current one-month plans end automatically and do not renew. Any different renewal terms will be shown at checkout.",
    category: "Plans & billing",
  },
  {
    question: "When will I be charged?",
    answer:
      "You are charged when you purchase a paid plan. Current one-month plans end automatically.",
    category: "Plans & billing",
  },
  {
    question: "What payment methods are accepted?",
    answer:
      "Available payment methods are shown during checkout and may depend on your country and payment provider.",
    category: "Plans & billing",
  },
  {
    question: "Is my payment information stored by Runly?",
    answer:
      "Sensitive payment information is handled by our payment provider. Runly does not need to directly store your full card details.",
    category: "Plans & billing",
  },
  {
    question: "Are there any hidden fees?",
    answer:
      "No. The price and any applicable charges should be shown before you complete your purchase.",
    category: "Plans & billing",
  },
  {
    question: "Can I upgrade my plan?",
    answer:
      "Yes. You can upgrade to another available plan when your account supports it.",
    category: "Plans & billing",
  },
  {
    question: "Can I downgrade my plan?",
    answer:
      "Yes, where available. A downgrade may take effect at the end of your current billing period.",
    category: "Plans & billing",
  },
  {
    question: "Can I cancel my subscription?",
    answer:
      "Current plans end automatically after the purchased term. If a recurring option is offered, its cancellation options will be shown in your account.",
    category: "Plans & billing",
  },
  {
    question: "What happens after I cancel?",
    answer:
      "You normally keep access until the end of the term you paid for. Current one-month plans stop automatically at the end of that term.",
    category: "Plans & billing",
  },
  {
    question: "Will cancelling delete my account?",
    answer:
      "No. Cancelling a subscription and deleting your Runly account are separate actions.",
    category: "Plans & billing",
  },
  {
    question: "Do you offer refunds?",
    answer:
      "Refunds are reviewed according to Runly's refund policy and the circumstances of the purchase.",
    category: "Plans & billing",
  },
  {
    question: "Can I get a refund if I forgot to cancel?",
    answer:
      "You can contact support and request a review, but approval is not guaranteed.",
    category: "Plans & billing",
  },
  {
    question: "What if I was charged twice?",
    answer:
      "Contact Runly support with the relevant billing information and we can investigate the duplicate charge.",
    category: "Plans & billing",
  },
  {
    question: "What if I don't recognize a Runly charge?",
    answer:
      "Contact support as soon as possible so the payment can be reviewed.",
    category: "Plans & billing",
  },
  {
    question: "What if my payment fails?",
    answer:
      "You may need to update your payment method or retry the payment. Access to paid features may be limited if a renewal payment cannot be completed.",
    category: "Plans & billing",
  },
  {
    question: "What happens when I reach my usage limit?",
    answer:
      "Some features may become unavailable until your usage renews, you purchase additional usage, or you move to a higher plan.",
    category: "Plans & billing",
  },
  {
    question: "When does my usage reset?",
    answer:
      "Your account will show the renewal or reset period associated with your plan.",
    category: "Plans & billing",
  },
  {
    question: "Does unused usage carry over?",
    answer:
      "Unless your plan specifically says otherwise, unused usage does not carry over into the next usage period.",
    category: "Plans & billing",
  },
  {
    question: "Can I buy additional usage?",
    answer:
      "Additional usage may be available depending on your plan and the current Runly billing options.",
    category: "Plans & billing",
  },
  {
    question: "Why does Runly have usage limits?",
    answer:
      "Running AI and development environments has real infrastructure costs, so usage limits help us keep plans sustainable and predictable.",
    category: "Plans & billing",
  },
  {
    question: "Can Runly change its prices?",
    answer:
      "Pricing may change as Runly develops. Any changes affecting an existing subscription will be communicated according to the applicable billing terms.",
    category: "Plans & billing",
  },
  {
    question: "Can I keep an old price forever?",
    answer:
      "Not necessarily. Promotional, beta, or early-access pricing may have separate conditions.",
    category: "Plans & billing",
  },
  {
    question: "What is Runly Cowork?",
    answer:
      "Runly Cowork is designed for people who want to work together on projects instead of building alone.",
    category: "Projects & support",
  },
  {
    question: "Can multiple people use one normal account?",
    answer:
      "Accounts are intended for the person who owns them unless a plan specifically includes team or collaborative access.",
    category: "Projects & support",
  },
  {
    question: "Can businesses use Runly?",
    answer:
      "Yes. Runly can be used by individuals, teams, startups, and businesses.",
    category: "Projects & support",
  },
  {
    question: "Is my work mine?",
    answer:
      "You keep ownership of the projects and content you create, subject to Runly's Terms of Service and any third-party services you choose to use.",
    category: "Projects & support",
  },
  {
    question: "Does Runly sell my projects?",
    answer:
      "No. Your projects are not products for Runly to sell to other users.",
    category: "Projects & support",
  },
  {
    question: "Can Runly guarantee that generated work has no errors?",
    answer:
      "No. AI-generated work can contain mistakes, so important projects should still be reviewed and tested.",
    category: "Projects & support",
  },
  {
    question: "Can my account be suspended?",
    answer:
      "Accounts may be restricted or suspended for abuse, fraud, payment issues, attempts to bypass platform limits, or violations of Runly's Terms of Service.",
    category: "Projects & support",
  },
  {
    question: "Can I share or resell my account?",
    answer:
      "No. Sharing or reselling an account is not allowed and may result in a ban.",
    category: "Projects & support",
  },
  {
    question: "What happens if Runly is temporarily unavailable?",
    answer:
      "We work to keep the platform available, but maintenance, outages, infrastructure issues, or third-party service problems can sometimes interrupt access.",
    category: "Projects & support",
  },
  {
    question: "Will I get compensation for downtime?",
    answer:
      "Any credits or compensation for downtime depend on the situation and the terms applying to your plan.",
    category: "Projects & support",
  },
  {
    question: "How do I contact support?",
    answer:
      "You can contact Runly through the support methods listed on the platform, such as the support page or official community channels.",
    category: "Projects & support",
  },
  {
    question: "How long does support take to reply?",
    answer:
      "Response times can vary depending on demand and the type of issue.",
    category: "Projects & support",
  },
  {
    question: "Can I request a feature?",
    answer:
      "Yes. Feedback and feature suggestions are welcome, especially while Runly continues to grow.",
    category: "Projects & support",
  },
  {
    question: "Can I report a bug?",
    answer:
      "Yes. If you find something broken, report it with as much information as possible so the team can investigate it.",
    category: "Projects & support",
  },
  {
    question: "Where can I read the full rules?",
    answer:
      "Runly's Terms of Service, Privacy Policy, billing terms, and other policies contain the full legal details that apply to your account and purchases.",
    category: "Projects & support",
  },
];
const categories = ["Getting started", "Plans & billing", "Projects & support"];
export function RunlyFaq() {
  const [category, setCategory] = useState(categories[0]);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);
  const id = useId();
  const visible = questions.filter((item) => item.category === category);
  return (
    <section className={styles.faq} id="faq" aria-labelledby="faq-title">
      <div className={styles.intro}>
        <span>GOOD QUESTIONS. CLEAR ANSWERS.</span>
        <h2 id="faq-title">
          A little clarity.
          <br />
          Before you begin.
        </h2>
        <p>Everything you want to know about building with Runly.</p>
        <div className={styles.categories} aria-label="FAQ topics">
          {categories.map((topic) => (
            <button
              key={topic}
              aria-pressed={category === topic}
              onClick={() => {
                setCategory(topic);
                setOpenQuestion(null);
              }}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.answers}>
        {visible.map((item, index) => {
          const open = openQuestion === item.question;
          const answerId = `${id}-answer-${index}`;
          return (
            <article key={item.question} data-open={open}>
              <h3>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={answerId}
                  onClick={() => setOpenQuestion(open ? null : item.question)}
                >
                  <span className={styles.number}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{item.question}</span>
                  <span className={styles.plus} aria-hidden="true">
                    +
                  </span>
                </button>
              </h3>
              <div className={styles.answer} id={answerId} inert={!open}>
                <div>
                  <p>{item.answer}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
