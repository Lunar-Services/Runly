import { AppShell } from "./app-shell";

export function FeatureComingSoon({ title }: { title: string }) {
  return (
    <AppShell title={title} eyebrow="Coming soon">
      <section className="feature-preview panel">
        <span className="setup-badge">Coming soon</span>
        <h2>{title}</h2>
        <p>
          {title === "Affiliates"
            ? "Partner applications, referral links, 30% commission tracking, and payout requests are being prepared."
            : "Coupon codes and calculator checkout with month selection are being prepared."}
        </p>
        {title === "Affiliates" && (
          <button className="button button-outline" disabled>
            Payout · Coming soon
          </button>
        )}
      </section>
    </AppShell>
  );
}
