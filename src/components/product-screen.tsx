"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  FileCode2,
  Plus,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppShell } from "./app-shell";
import { Brand } from "./brand";
import { BillingSettings, PricingPlans, UpgradePlans } from "./billing";
import { AdminBillingPlans } from "./admin-billing-plans";
import { ProjectWorkspace as InteractiveProjectWorkspace } from "./project-workspace";

export function ProductScreen({ slug }: { slug: string[] }) {
  const route = `/${slug.join("/")}`;
  if (route === "/terms" || route === "/privacy")
    return <LegalPage kind={route.slice(1) as "terms" | "privacy"} />;
  if (route === "/pricing") return <PricingPage />;
  if (route.startsWith("/project/"))
    return <InteractiveProjectWorkspace projectId={slug[1] || ""} />;
  if (route.startsWith("/cowork/workspace/")) return <CoworkWorkspace />;
  if (route.startsWith("/cowork")) return <CoworkHome />;
  if (route.startsWith("/admin")) return <AdminScreen route={route} />;
  if (route.startsWith("/settings")) return <SettingsScreen route={route} />;
  return <Dashboard route={route} />;
}

function Dashboard({ route }: { route: string }) {
  const projects = route.endsWith("projects");
  return (
    <AppShell title={projects ? "Projects" : "Good morning."}>
      <div className="page-actions">
        <p className="muted">
          {projects
            ? "Search and manage everything you build."
            : "Your workspace is ready when the services are."}
        </p>
        <Link className="button button-dark" href="/dashboard/projects">
          <Plus size={16} /> New project
        </Link>
      </div>
      {!projects && (
        <div className="metric-grid">
          <Metric label="Projects" value="—" note="Connect Supabase" />
          <Metric
            label="3-hour allowance"
            value="—"
            note="No entitlement loaded"
          />
          <Metric label="GitHub" value="Off" note="Not connected" />
        </div>
      )}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>{projects ? "All projects" : "Recent projects"}</h2>
            <p>Real project data will appear after Supabase setup.</p>
          </div>
          {projects && (
            <label className="search-field">
              <Search size={16} />
              <input
                placeholder="Search projects"
                aria-label="Search projects"
              />
            </label>
          )}
        </div>
        <div className="empty-state">
          <div className="empty-icon">
            <FileCode2 />
          </div>
          <h3>No projects yet</h3>
          <p>
            Start with a sentence. Runly will create project files and a
            recoverable checkpoint.
          </p>
          <Link className="button button-dark" href="/dashboard/projects">
            Create your first project <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </AppShell>
  );
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
function CoworkWorkspace() {
  return (
    <AppShell title="Design Studio" eyebrow="Cowork / Workspace">
      <div className="notice">
        <AlertTriangle />
        Demo surface only—connect Supabase Realtime before inviting members.
      </div>
      <div className="two-col">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Shared conversation</h2>
              <p>Messages and AI actions appear with a named actor.</p>
            </div>
          </div>
          <div className="empty-state compact">
            <Users />
            <h3>No team activity</h3>
            <p>Invite a teammate to begin.</p>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Members</h2>
              <p>0 of 5 seats used</p>
            </div>
          </div>
          <button
            className="button button-dark full"
            disabled
            title="Connect Supabase Realtime before inviting members"
          >
            Invite member
          </button>
        </section>
      </div>
    </AppShell>
  );
}

function SettingsScreen({ route }: { route: string }) {
  if (route === "/settings/billing/upgrade") return <UpgradePlans />;
  if (route.includes("billing")) return <BillingSettings />;
  return (
    <AppShell title="Settings">
      <div className="settings-grid">
        <section className="panel form-panel">
          <h2>Account</h2>
          <p className="muted">Manage your profile from account settings.</p>
          <Link className="button button-dark" href="/settings">
            Open account settings
          </Link>
        </section>
        <section className="panel">
          <h2>Connected services</h2>
          <Service name="Supabase" status="Setup required" />
          <Service name="GitHub App" status="Not connected" />
          <Service name="OpenAI" status="Not configured" />
        </section>
      </div>
    </AppShell>
  );
}
function Service({ name, status }: { name: string; status: string }) {
  return (
    <div className="service-row">
      <div>
        <strong>{name}</strong>
        <small>{status}</small>
      </div>
      <button
        className="button button-outline"
        disabled
        title={`${name} configuration is not available until the backend is connected`}
      >
        Configure
      </button>
    </div>
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
  return (
    <div className="standalone">
      <div className="standalone-nav">
        <Brand />
        <Link className="button button-dark" href="/signup">
          Start building
        </Link>
      </div>
      <section className="standalone-head">
        <p className="eyebrow">Pricing</p>
        <h1>
          Pay for momentum,
          <br />
          not complexity.
        </h1>
        <a
          className="stripe-payment-mark"
          href="https://stripe.com"
          target="_blank"
          rel="noreferrer"
          aria-label="Payments securely processed by Stripe"
        >
          <span className="stripe-payment-logo" aria-hidden="true" />
        </a>
      </section>
      <PricingPlans />
    </div>
  );
}

function LegalPage({ kind }: { kind: "terms" | "privacy" }) {
  const terms = kind === "terms";
  const sections = terms ? termsSections : privacySections;
  return (
    <div className="legal-page">
      <header>
        <Brand />
        <Link href="/">Back home</Link>
      </header>
      <main>
        <div className="draft-banner">
          <AlertTriangle /> DRAFT FOR REVIEW — NOT YET PUBLISHED
        </div>
        <p className="eyebrow">Legal / {terms ? "Terms" : "Privacy"}</p>
        <h1>{terms ? "Terms of Service" : "Privacy Policy"}</h1>
        <p className="legal-meta">
          Effective date: [INSERT EFFECTIVE DATE] · Version: draft-0.1
        </p>
        <p className="lede">
          This document describes the planned Runly service and contains
          unresolved legal and operational details. It must be completed and
          reviewed before publication.
        </p>
        {sections.map(([title, body], i) => (
          <section key={title}>
            <h2>
              {i + 1}. {title}
            </h2>
            <p>{body}</p>
          </section>
        ))}
        <div className="legal-check">
          <h2>Publication blockers</h2>
          <p>
            Legal entity, contact details, governing law, retention periods,
            refund policy, processing regions, age requirements, and deployed
            provider practices must be verified.
          </p>
        </div>
      </main>
    </div>
  );
}
const termsSections = [
  [
    "Acceptance and eligibility",
    "These Terms govern access to Runly’s AI-assisted development tools, project workspaces, GitHub integration, and Cowork. Users must meet the finalized age and eligibility requirements.",
  ],
  [
    "Your content and projects",
    "You retain your rights in prompts, code, files, project materials, and conversations. You permit Runly to process that content only as needed to provide and secure the service.",
  ],
  [
    "AI limitations",
    "Generated responses can be inaccurate, insecure, or incomplete. Users are responsible for reviewing code, dependencies, licenses, and deployment suitability.",
  ],
  [
    "Plans and usage",
    "Plan allowances are enforced by backend records across independent rolling windows. Purchased Runly usage is not an OpenAI credit or cash balance.",
  ],
  [
    "Availability",
    "Runly depends on external providers. The service does not promise uninterrupted generation, preview, repository sync, or collaboration.",
  ],
] as const;
const privacySections = [
  [
    "Information we collect",
    "Runly may process account details, prompts, code, project files, connected-repository metadata, Cowork activity, billing references, and security logs when those features are enabled.",
  ],
  [
    "How information is used",
    "Information is used to authenticate users, fulfill requested AI and repository actions, secure the service, administer subscriptions, and provide support.",
  ],
  [
    "AI provider and project content",
    "A request may send the prompt and relevant project context to the configured AI provider. Exact provider settings and retention behavior must be verified before publication.",
  ],
  [
    "Connected services",
    "Depending on enabled features, Runly expects to use Supabase, OpenAI, Stripe, GitHub, hosting, email, and monitoring providers.",
  ],
  [
    "Retention and rights",
    "Actual retention periods, deletion workflows, export methods, processing regions, and jurisdiction-specific rights must be implemented and documented before launch.",
  ],
] as const;
