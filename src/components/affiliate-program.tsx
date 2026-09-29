"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, RefreshCw, X } from "lucide-react";
import { AppShell } from "./app-shell";
import styles from "./affiliate-program.module.css";

type Application = {
  id: string;
  user_id: string;
  email?: string;
  status: "pending" | "approved" | "rejected";
  website: string;
  audience: string;
  promotion_plan: string;
  code: string | null;
  commission_bps: number;
  decision_note: string | null;
  created_at: string;
  referrals?: number;
  conversions?: number;
  pendingCents?: number;
  paidCents?: number;
};
type AffiliateData = {
  application: Application | null;
  referralLink?: string | null;
  stats?: {
    referrals: number;
    conversions: number;
    pendingCents: number;
    approvedCents: number;
    paidCents: number;
  };
  commissions?: Array<{
    id: string;
    gross_amount_cents: number;
    commission_amount_cents: number;
    currency: string;
    status: string;
    created_at: string;
  }>;
};

const currency = (cents: number, code = "usd") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: code.toUpperCase(),
  }).format((cents || 0) / 100);

export function AffiliateDashboard() {
  const [data, setData] = useState<AffiliateData | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/affiliate", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setData(result);
    else {
      setData({ application: null });
      setError(result.message || "Couldn't load the affiliate program.");
    }
  }, []);
  useEffect(() => void load(), [load]);

  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const response = await fetch("/api/affiliate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        website: values.get("website"),
        audience: values.get("audience"),
        promotionPlan: values.get("promotionPlan"),
      }),
    });
    const result = await response.json();
    if (response.ok) await load();
    else setError(result.message || "Couldn't submit your application.");
    setSaving(false);
  }

  const application = data?.application;
  if (!data)
    return (
      <AppShell title="Affiliate program" eyebrow="Partner revenue">
        <div className={styles.shell}>
          <section className={styles.card}>
            <h2>Loading your partner profile…</h2>
          </section>
        </div>
      </AppShell>
    );
  return (
    <AppShell title="Affiliate program" eyebrow="Partner revenue">
      <div className={styles.shell}>
        {!application || application.status === "rejected" ? (
          <>
            <section className={styles.hero}>
              <div className={styles.heroMain}>
                <span className={styles.eyebrow}>Runly partner network</span>
                <div>
                  <h2>Earn when your audience builds with Runly.</h2>
                  <p>
                    Apply once. Approved partners receive a private referral
                    link and earn 30% of every paid invoice attributed to it.
                  </p>
                </div>
              </div>
              <aside className={styles.heroAside}>
                <span className={styles.eyebrow}>Revenue share</span>
                <div>
                  <strong>30%</strong>
                  <p>Automatically calculated from verified Stripe payments.</p>
                </div>
              </aside>
            </section>
            <form className={styles.form} onSubmit={apply}>
              <h2>
                {application
                  ? "Update your application"
                  : "Apply to the program"}
              </h2>
              {application?.decision_note && (
                <p className={styles.notice}>{application.decision_note}</p>
              )}
              {error && (
                <p className={styles.notice} role="alert">
                  {error}
                </p>
              )}
              <label>
                Website or primary channel
                <input
                  name="website"
                  placeholder="https://your-site.com"
                  defaultValue={application?.website}
                  required
                />
              </label>
              <label>
                Tell us about your audience
                <textarea
                  name="audience"
                  rows={4}
                  minLength={10}
                  defaultValue={application?.audience}
                  required
                />
              </label>
              <label>
                How will you promote Runly?
                <textarea
                  name="promotionPlan"
                  rows={5}
                  minLength={10}
                  defaultValue={application?.promotion_plan}
                  required
                />
              </label>
              <button className={styles.action} disabled={saving}>
                {saving ? "Submitting…" : "Submit application"}
              </button>
            </form>
          </>
        ) : application.status === "pending" ? (
          <section className={styles.hero}>
            <div className={styles.heroMain}>
              <span className={styles.status}>{application.status}</span>
              <div>
                <h2>
                  {application.status === "pending"
                    ? "Your application is in review."
                    : "Your application needs another look."}
                </h2>
                <p>
                  {application.decision_note ||
                    (application.status === "pending"
                      ? "An administrator will review your audience and promotion plan."
                      : "Update your plan and submit a new application when ready.")}
                </p>
              </div>
            </div>
            <aside className={styles.heroAside}>
              <span className={styles.eyebrow}>Submitted</span>
              <div>
                <strong>{new Date(application.created_at).getDate()}</strong>
                <p>
                  {new Date(application.created_at).toLocaleDateString(
                    "en-US",
                    { month: "long", year: "numeric" },
                  )}
                </p>
              </div>
            </aside>
          </section>
        ) : (
          <>
            <section className={styles.hero}>
              <div className={styles.heroMain}>
                <span className={styles.status}>Approved partner</span>
                <div>
                  <h2>Your affiliate revenue, in one clear view.</h2>
                  <p>Share your link. Paid invoices earn a 30% commission.</p>
                </div>
              </div>
              <aside className={styles.heroAside}>
                <span className={styles.eyebrow}>Paid earnings</span>
                <div>
                  <strong>{currency(data.stats?.paidCents || 0)}</strong>
                  <p>Verified commissions already marked as paid.</p>
                </div>
              </aside>
            </section>
            <div className={styles.metrics}>
              <Metric
                label="Referrals"
                value={String(data.stats?.referrals || 0)}
              />
              <Metric
                label="Conversions"
                value={String(data.stats?.conversions || 0)}
              />
              <Metric
                label="Pending"
                value={currency(data.stats?.pendingCents || 0)}
              />
              <Metric
                label="Approved"
                value={currency(data.stats?.approvedCents || 0)}
              />
            </div>
            <section className={styles.linkCard}>
              <div>
                <small>Your private referral link</small>
                <code>{data.referralLink}</code>
              </div>
              <button
                className={styles.action}
                onClick={async () => {
                  await navigator.clipboard.writeText(data.referralLink || "");
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
              >
                {copied ? <Check size={19} /> : <Copy size={19} />}{" "}
                {copied ? "Copied" : "Copy link"}
              </button>
            </section>
            <CommissionTable rows={data.commissions || []} />
          </>
        )}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className={styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function CommissionTable({
  rows,
}: {
  rows: NonNullable<AffiliateData["commissions"]>;
}) {
  return (
    <section className={styles.tableCard}>
      <div className={styles.tableHead}>
        <h2>Commission history</h2>
        <span className={styles.status}>{rows.length} invoices</span>
      </div>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Sale</th>
              <th>Your 30%</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr key={row.id}>
                  <td>{new Date(row.created_at).toLocaleDateString()}</td>
                  <td>{currency(row.gross_amount_cents, row.currency)}</td>
                  <td>{currency(row.commission_amount_cents, row.currency)}</td>
                  <td>{row.status}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4}>No attributed payments yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AdminAffiliates() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [filter, setFilter] = useState<"all" | Application["status"]>("all");
  const [error, setError] = useState("");
  const [pendingId, setPendingId] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/affiliates", {
      cache: "no-store",
    });
    const result = await response.json();
    if (response.ok) setApplications(result.applications || []);
    else setError(result.message || "Couldn't load affiliate operations.");
  }, []);
  useEffect(() => void load(), [load]);
  const visible = useMemo(
    () =>
      filter === "all"
        ? applications
        : applications.filter((item) => item.status === filter),
    [applications, filter],
  );
  const pending = applications.filter(
    (item) => item.status === "pending",
  ).length;
  const approved = applications.filter(
    (item) => item.status === "approved",
  ).length;
  const totalPending = applications.reduce(
    (sum, item) => sum + (item.pendingCents || 0),
    0,
  );

  async function decide(
    applicationId: string,
    decision: "approved" | "rejected",
  ) {
    const note =
      decision === "rejected"
        ? "This application did not meet the current partner criteria. Update your audience and promotion plan, then apply again."
        : "";
    setPendingId(applicationId);
    setError("");
    const response = await fetch("/api/admin/affiliates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, decision, note }),
    });
    const result = await response.json();
    if (response.ok) await load();
    else setError(result.message || "Couldn't save this decision.");
    setPendingId("");
  }

  return (
    <AppShell title="Affiliate network" eyebrow="Revenue partnerships">
      <div className={styles.shell}>
        <section className={styles.adminSummary}>
          <Metric label="Awaiting review" value={String(pending)} />
          <Metric label="Approved partners" value={String(approved)} />
          <Metric label="Pending commissions" value={currency(totalPending)} />
          <Metric label="Revenue share" value="30%" />
        </section>
        <section className={styles.tableCard}>
          <div className={styles.tableHead}>
            <div>
              <h2>Partner applications</h2>
              <p>Review reach, promotion quality, and attributed revenue.</p>
            </div>
            <div className={styles.applicationActions}>
              {(["all", "pending", "approved", "rejected"] as const).map(
                (status) => (
                  <button
                    key={status}
                    className={
                      filter === status ? styles.action : styles.secondaryAction
                    }
                    onClick={() => setFilter(status)}
                  >
                    {status}
                  </button>
                ),
              )}
              <button
                className={styles.secondaryAction}
                onClick={() => void load()}
                aria-label="Refresh applications"
              >
                <RefreshCw size={19} />
              </button>
            </div>
          </div>
        </section>
        {error && (
          <p className={styles.notice} role="alert">
            {error}
          </p>
        )}
        <div className={styles.applications}>
          {visible.map((application) => (
            <article className={styles.application} key={application.id}>
              <div className={styles.applicationHead}>
                <div>
                  <h3>{application.email}</h3>
                  <p>{application.website}</p>
                </div>
                <span className={styles.status}>{application.status}</span>
              </div>
              <div className={styles.applicationGrid}>
                <div>
                  <small>Performance</small>
                  <p>
                    {application.referrals || 0} referrals ·{" "}
                    {application.conversions || 0} paid
                  </p>
                </div>
                <div>
                  <small>Audience</small>
                  <p>{application.audience}</p>
                </div>
                <div>
                  <small>Promotion plan</small>
                  <p>{application.promotion_plan}</p>
                </div>
              </div>
              <div className={styles.applicationActions}>
                {application.code && <code>{application.code}</code>}
                {application.status === "pending" && (
                  <>
                    <button
                      className={styles.secondaryAction}
                      disabled={pendingId === application.id}
                      onClick={() => void decide(application.id, "rejected")}
                    >
                      <X size={18} /> Reject
                    </button>
                    <button
                      className={styles.action}
                      disabled={pendingId === application.id}
                      onClick={() => void decide(application.id, "approved")}
                    >
                      <Check size={18} /> Approve
                    </button>
                  </>
                )}
                {application.website.startsWith("http") && (
                  <a
                    className={styles.secondaryAction}
                    href={application.website}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={18} /> Visit
                  </a>
                )}
              </div>
            </article>
          ))}
          {!visible.length && (
            <section className={styles.card}>
              <h2>No applications here</h2>
              <p>New partner applications will appear in this review queue.</p>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
