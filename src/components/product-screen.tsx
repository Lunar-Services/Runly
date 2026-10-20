"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Bot,
  CheckCircle2,
  Clock3,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { AdminBillingPlans } from "./admin-billing-plans";
import { PricingUI } from "./pricing-ui";
const InteractiveProjectWorkspace = dynamic(
  () => import("./project-workspace").then((module) => module.ProjectWorkspace),
  { ssr: false },
);

export function ProductScreen({ slug }: { slug: string[] }) {
  const route = `/${slug.join("/")}`;
  if (route === "/pricing") return <PricingPage />;
  if (route.startsWith("/project/"))
    return <InteractiveProjectWorkspace projectId={slug[1] || ""} />;
  if (route.startsWith("/cowork")) return <CoworkHome />;
  if (route.startsWith("/admin")) return <AdminScreen route={route} />;
  return null;
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article className="metric">
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function CoworkHome() {
  return (
    <AppShell title="Cowork" eyebrow="Team workspace">
      <div className="page-actions">
        <p className="muted">
          Shared projects, context, and activity with server-enforced roles.
        </p>
        <button
          className="button button-dark"
          disabled
          title="Connect Supabase to create workspaces"
        >
          <Plus size={16} /> New workspace
        </button>
      </div>
      <section className="panel">
        <div className="empty-state">
          <div className="empty-icon">
            <Users />
          </div>
          <h3>Create your team space</h3>
          <p>
            Cowork keeps AI usage shared at workspace level and labels every
            teammate’s change.
          </p>
          <button
            className="button button-dark"
            disabled
            title="Connect Supabase to create workspaces"
          >
            Create workspace
          </button>
        </div>
      </section>
    </AppShell>
  );
}
function AdminScreen({ route }: { route: string }) {
  const providers = route.includes("ai-providers"),
    legal = route.includes("legal"),
    usage = route.includes("usage");
  if (route.includes("billing")) return <AdminBillingPlans />;
  return (
    <AppShell
      title={
        providers
          ? "AI providers"
          : legal
            ? "Legal documents"
            : usage
              ? "Usage controls"
              : "Operations"
      }
      eyebrow="Restricted admin"
    >
      <div className="notice">
        <ShieldCheck />
        Admin access must be verified server-side. This route stays in setup
        mode until Supabase roles are configured.
      </div>
      {providers ? (
        <ProviderPanel />
      ) : legal ? (
        <LegalAdmin />
      ) : usage ? (
        <UsageAdmin />
      ) : (
        <div className="metric-grid">
          <Metric label="Active users" value="—" note="No database" />
          <Metric label="Provider spend" value="—" note="No provider" />
          <Metric label="Queued jobs" value="0" note="Worker offline" />
        </div>
      )}
    </AppShell>
  );
}
function ProviderPanel() {
  return (
    <div className="settings-grid">
      <section className="panel form-panel">
        <h2>Add a provider key</h2>
        <p className="muted">
          The secret is accepted once over HTTPS and must be encrypted
          server-side before storage.
        </p>
        <label>
          Friendly name
          <input placeholder="Production OpenAI" />
        </label>
        <label>
          Secret storage
          <input
            value="Unavailable until encryption is configured"
            readOnly
            disabled
          />
        </label>
        <label>
          Model
          <input placeholder="Verify in your OpenAI project" />
        </label>
        <div className="button-row">
          <button
            className="button button-outline"
            disabled
            title="Add encrypted credentials before testing"
          >
            Test connection
          </button>
          <button className="button button-dark" disabled>
            Save & activate
          </button>
        </div>
      </section>
      <section className="panel">
        <h2>Active credentials</h2>
        <div className="empty-state compact">
          <Bot />
          <h3>No credentials stored</h3>
          <p>Add encryption and provider credentials before activation.</p>
        </div>
      </section>
    </div>
  );
}
function UsageAdmin() {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Quota service</h2>
          <p>Server-side reservation and reconciliation status.</p>
        </div>
        <span className="setup-badge">Database required</span>
      </div>
      <div className="check-list">
        <p>
          <CheckCircle2 /> Dual rolling windows defined in migration
        </p>
        <p>
          <CheckCircle2 /> Immutable usage event model
        </p>
        <p>
          <Clock3 /> Atomic reservation RPC requires deployment test
        </p>
      </div>
    </section>
  );
}
function LegalAdmin() {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Draft policies</h2>
          <p>
            Publication is blocked while required legal facts remain unresolved.
          </p>
        </div>
        <span className="danger-badge">Draft only</span>
      </div>
      <div className="legal-list">
        <Link href="/terms">
          <b>Terms of Service</b>
          <span>Unresolved fields</span>
        </Link>
        <Link href="/privacy">
          <b>Privacy Policy</b>
          <span>Unresolved fields</span>
        </Link>
      </div>
    </section>
  );
}

function PricingPage() {
  return <PricingUI />;
}
