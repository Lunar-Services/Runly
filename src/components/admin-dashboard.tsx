"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, Network, Server, X, type LucideIcon } from "lucide-react";
import { Brand } from "./brand";
import type { CustomerAccount } from "./customer-header";
import styles from "./admin-dashboard.module.css";
import { AdminSwiftlet, AdminNests } from "./admin-infrastructure";

type AdminUser = {
  id: string;
  name: string;
  email: string;
  plan: string;
  projects: number;
  joined: string;
  status: string;
  avatarTone: string;
};
type AdminProject = {
  id: string;
  name: string;
  owner: string;
  type: string;
  updated: string;
  created: string;
  status: string;
};
type AdminUsage = {
  id: string;
  project: string;
  user: string;
  type: string;
  tokens: number;
  date: string;
  status: string;
};
type AdminActivity = {
  id: string;
  event: string;
  actor: string;
  subject: string;
  date: string;
  time: string;
  category: string;
};
type CreationPoint = {
  date: string;
  website: number;
  video: number;
  app: number;
};
type AdminReport = {
  users: AdminUser[];
  projects: AdminProject[];
  usage: AdminUsage[];
  activity: AdminActivity[];
  creationActivity: CreationPoint[];
  overview: {
    users: number;
    activeProjects: number;
    tokensUsed: number;
    sandboxAvailable: boolean;
  };
  limit: number;
  truncated: boolean;
};
type AdminInvoice = {
  id: string;
  user: string;
  plan: string;
  amount: number;
  currency: string;
  date: string;
  status: string;
};
type BillingReport = {
  invoices: AdminInvoice[];
  configured: boolean;
  hasMore?: boolean;
};
const emptyBilling: BillingReport = { invoices: [], configured: false };
async function adminRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.message || "Couldn't load administration data.");
  return result as T;
}

export type AdminTab =
  | "overview"
  | "users"
  | "projects"
  | "usage"
  | "billing"
  | "activity"
  | "swiftlet"
  | "nests"
  | "settings";
const asset = (file: string) => `/figma/admin/${file}`;
function useRangePreference() {
  const [range, setRange] = useState(30);
  useEffect(() => {
    let active = true;
    adminRequest<{ defaultRange: number }>("/api/admin/settings")
      .then((value) => {
        if (active) setRange(value.defaultRange);
      })
      .catch(() => {
        /* The report keeps its initial date range on a preference read failure. */
      });
    const changed = (event: Event) =>
      setRange((event as CustomEvent<number>).detail);
    window.addEventListener("runly-admin-preferences", changed);
    return () => {
      active = false;
      window.removeEventListener("runly-admin-preferences", changed);
    };
  }, []);
  return range;
}
const tabs: {
  id: AdminTab;
  label: string;
  icon: string | LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    id: "overview",
    label: "Overview",
    icon: "bb77a.svg",
    title: "Workspace overview",
    description: "Keep your people, projects, and usage in view.",
  },
  {
    id: "users",
    label: "Users",
    icon: "c39f0.svg",
    title: "Users",
    description: "A clear view of the people in your workspace.",
  },
  {
    id: "projects",
    label: "Projects",
    icon: "90e38.svg",
    title: "Projects",
    description: "Every creation, from the first idea to the latest release.",
  },
  {
    id: "usage",
    label: "AI usage",
    icon: "89332.svg",
    title: "AI usage",
    description: "Understand usage and see which jobs need attention.",
  },
  {
    id: "billing",
    label: "Billing",
    icon: "762ef.svg",
    title: "Billing",
    description: "Keep subscriptions, payments, and revenue in view.",
  },
  {
    id: "activity",
    label: "Activity log",
    icon: "c9e85.svg",
    title: "Activity log",
    description: "Follow the people and changes across your workspace.",
  },
  {
    id: "swiftlet",
    label: "Swiftlet",
    icon: Network,
    title: "Swiftlet",
    description: "Configure the service that orchestrates your sandbox fleet.",
  },
  {
    id: "nests",
    label: "Nests",
    icon: Server,
    title: "Nests",
    description: "Manage the VPS daemons that run your Eggs.",
  },
  {
    id: "settings",
    label: "Settings",
    icon: "c3951.svg",
    title: "Admin settings",
    description: "Your dashboard preferences and administration tools.",
  },
];
type Detail = { title: string; fields: Record<string, string> };
type Row = {
  id: string;
  title: string;
  subtitle?: string;
  avatarTone?: string;
  cells: string[];
  status: string;
  date: string;
  fields: Record<string, string>;
};
type DirectoryTab = Exclude<
  AdminTab,
  "overview" | "settings" | "swiftlet" | "nests"
>;
const dateText = (date: string) =>
  new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
const money = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(value);
const dateWithin = (date: string, days: number) =>
  Date.parse(date) >= Date.now() - days * 86400000;

function Icon({ file, size = 18 }: { file: string; size?: number }) {
  return (
    <Image
      src={asset(file)}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
    />
  );
}
function Arrow() {
  return <Icon file="4fa25.svg" size={17} />;
}
function Badge({ children }: { children: string }) {
  const tone = ["Active", "Published", "Completed", "Paid"].includes(children)
    ? "good"
    : ["Invited", "Failed", "Needs attention"].includes(children)
      ? "warning"
      : "neutral";
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
function Metric({
  label,
  value,
  note,
  positive = false,
}: {
  label: string;
  value: string;
  note: string;
  positive?: boolean;
}) {
  return (
    <article className={styles.metric}>
      <p>{label}</p>
      <strong>{value}</strong>
      <small className={positive ? styles.positive : undefined}>{note}</small>
    </article>
  );
}
function Table({
  columns,
  rows,
  onDetail,
  caption,
}: {
  columns: string[];
  rows: Row[];
  onDetail: (detail: Detail) => void;
  caption: string;
}) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
            <th scope="col">
              <span className={styles.srOnly}>Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className={styles.person}>
                    {row.avatarTone && (
                      <span
                        className={styles.personAvatar}
                        data-tone={row.avatarTone}
                        aria-hidden="true"
                      >
                        {row.title[0]}
                      </span>
                    )}
                    <span>
                      <strong>{row.title}</strong>
                      {row.subtitle && <small>{row.subtitle}</small>}
                    </span>
                  </div>
                </td>
                {row.cells.map((cell, index) => (
                  <td key={columns[index + 1]}>{cell}</td>
                ))}
                <td>
                  <Badge>{row.status}</Badge>
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.rowAction}
                    aria-label={`View ${row.title}`}
                    onClick={() =>
                      onDetail({ title: row.title, fields: row.fields })
                    }
                  >
                    <Arrow />
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length + 1}>
                <div className={styles.empty}>
                  <strong>No results found</strong>
                  <p>Try a different search, filter, or date range.</p>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function userRows(users: AdminUser[]): Row[] {
  return users.map((user) => ({
    id: user.id,
    title: user.name,
    subtitle: user.email,
    avatarTone: user.avatarTone,
    cells: [user.plan, String(user.projects), dateText(user.joined)],
    status: user.status,
    date: user.joined,
    fields: {
      Email: user.email,
      Plan: user.plan,
      Projects: String(user.projects),
      Joined: dateText(user.joined),
      Status: user.status,
    },
  }));
}
function directory(
  tab: DirectoryTab,
  report: AdminReport,
  billing: BillingReport,
): {
  columns: string[];
  rows: Row[];
  statuses: string[];
  label: string;
} {
  if (tab === "users")
    return {
      columns: ["Name", "Plan", "Projects", "Joined", "Status"],
      rows: userRows(report.users),
      statuses: ["Active", "Unverified", "Inactive"],
      label: "All users",
    };
  if (tab === "projects")
    return {
      columns: ["Project", "Owner", "Type", "Updated", "Status"],
      statuses: ["Published", "In progress", "Draft", "Archived"],
      label: "All projects",
      rows: report.projects.map((project) => ({
        id: project.id,
        title: project.name,
        cells: [project.owner, project.type, dateText(project.updated)],
        status: project.status,
        date: project.updated,
        fields: {
          Owner: project.owner,
          Type: project.type,
          Updated: dateText(project.updated),
          Status: project.status,
        },
      })),
    };
  if (tab === "usage")
    return {
      columns: ["Project", "User", "Tokens", "Date", "Status"],
      statuses: ["Completed", "Failed"],
      label: "Usage history",
      rows: report.usage.map((job) => ({
        id: job.id,
        title: job.project,
        subtitle: job.id,
        cells: [
          job.user,
          job.tokens.toLocaleString("en-US"),
          dateText(job.date),
        ],
        status: job.status,
        date: job.date,
        fields: {
          Job: job.id,
          User: job.user,
          Type: job.type,
          Tokens: job.tokens.toLocaleString("en-US"),
          Date: dateText(job.date),
          Status: job.status,
        },
      })),
    };
  if (tab === "billing")
    return {
      columns: ["Invoice", "Customer", "Plan", "Amount", "Status"],
      statuses: ["Paid", "Needs attention", "Void"],
      label: "Recent invoices",
      rows: billing.invoices.map((invoice) => ({
        id: invoice.id,
        title: invoice.id,
        subtitle: dateText(invoice.date),
        cells: [
          invoice.user,
          invoice.plan,
          money(invoice.amount, invoice.currency),
        ],
        status: invoice.status,
        date: invoice.date,
        fields: {
          Invoice: invoice.id,
          Customer: invoice.user,
          Plan: invoice.plan,
          Amount: money(invoice.amount, invoice.currency),
          Date: dateText(invoice.date),
          Status: invoice.status,
        },
      })),
    };
  return {
    columns: ["Event", "Actor", "Subject", "Date", "Category"],
    statuses: [...new Set(report.activity.map((event) => event.category))],
    label: "Workspace events",
    rows: report.activity.map((event) => ({
      id: event.id,
      title: event.event,
      subtitle: event.time,
      cells: [event.actor, event.subject, dateText(event.date)],
      status: event.category,
      date: event.date,
      fields: {
        Event: event.event,
        Actor: event.actor,
        Subject: event.subject,
        Date: dateText(event.date),
        Time: event.time,
        Category: event.category,
      },
    })),
  };
}

function CreationChart({ data }: { data: CreationPoint[] }) {
  const [videoVisible, setVideoVisible] = useState(true);
  const [webVisible, setWebVisible] = useState(true);
  const ceiling = Math.max(
    3,
    ...data.map((point) => Math.max(point.video, point.website + point.app)),
  );
  return (
    <section
      className={`${styles.panel} ${styles.chartPanel}`}
      aria-labelledby="creation-heading"
    >
      <div className={styles.panelHeading}>
        <div>
          <h2 id="creation-heading">Creation activity</h2>
          <p>Projects created each day</p>
        </div>
        <div className={styles.legend}>
          <button
            type="button"
            className={styles.videoLegend}
            aria-pressed={videoVisible}
            onClick={() => setVideoVisible(!videoVisible)}
          >
            Videos
          </button>
          <button
            type="button"
            className={styles.webLegend}
            aria-pressed={webVisible}
            onClick={() => setWebVisible(!webVisible)}
          >
            Websites &amp; apps
          </button>
        </div>
      </div>
      <div className={styles.chartScroll}>
        <div
          className={styles.chart}
          role="img"
          aria-label="Daily project creation counts. Values are available in the table below."
        >
          <div className={styles.axis} aria-hidden="true">
            {[
              ceiling,
              Math.round((ceiling * 2) / 3),
              Math.round(ceiling / 3),
              0,
            ].map((value, index) => (
              <span key={index}>{value}</span>
            ))}
          </div>
          <div className={styles.plot}>
            <div className={styles.gridlines} aria-hidden="true">
              {[0, 1, 2, 3].map((n) => (
                <span key={n} />
              ))}
            </div>
            <div className={styles.barGroups}>
              {data.map((point, index) => (
                <div className={styles.barGroup} key={point.date}>
                  <div className={styles.bars} aria-hidden="true">
                    <span
                      className={styles.videoBar}
                      style={{
                        height: `${(point.video / ceiling) * 100}%`,
                        opacity: videoVisible ? 1 : 0,
                      }}
                    />
                    <span
                      className={styles.webBar}
                      style={{
                        height: `${((point.website + point.app) / ceiling) * 100}%`,
                        opacity: webVisible ? 1 : 0,
                      }}
                    />
                  </div>
                  <span className={styles.chartDate}>
                    {index % Math.max(1, Math.ceil(data.length / 7)) === 0
                      ? dateText(point.date).replace(/, \d{4}$/, "")
                      : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <table className={styles.srOnly}>
        <caption>Daily project creation counts</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Videos</th>
            <th>Websites and apps</th>
          </tr>
        </thead>
        <tbody>
          {data.map((point) => (
            <tr key={point.date}>
              <th>{point.date}</th>
              <td>{point.video}</td>
              <td>{point.website + point.app}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function Overview({
  days,
  report,
  onDetail,
}: {
  days: number;
  report: AdminReport;
  onDetail: (detail: Detail) => void;
}) {
  return (
    <>
      <div className={styles.metrics}>
        <Metric
          label="Total users"
          value={report.overview.users.toLocaleString()}
          note="Accounts in the loaded directory"
        />
        <Metric
          label="Active projects"
          value={report.overview.activeProjects.toLocaleString()}
          note="Projects that have not been archived"
        />
        <Metric
          label="AI tokens used"
          value={report.overview.tokensUsed.toLocaleString()}
          note={`Recorded over the last ${days} days`}
        />
        <Metric
          label="Recorded events"
          value={report.activity.length.toLocaleString()}
          note={`Activity over the last ${days} days`}
        />
      </div>
      <div className={styles.overviewGrid}>
        <CreationChart data={report.creationActivity} />
        <section
          className={`${styles.panel} ${styles.attention}`}
          aria-labelledby="attention-heading"
        >
          <div className={styles.panelHeading}>
            <h2 id="attention-heading">Service availability</h2>
          </div>
          <div className={styles.attentionRow}>
            <Icon file="93bca.svg" />
            <span>
              <strong>Sandbox services are not connected</strong>
              <small>
                Generation, terminal sessions, framework previews and video
                exports require the deferred runtime.
              </small>
            </span>
          </div>
          <Link href="/admin/activity" className={styles.attentionRow}>
            <Icon file="6c60b.svg" />
            <span>
              <strong>Review recorded activity</strong>
              <small>{report.activity.length} events in this report</small>
            </span>
            <Arrow />
          </Link>
          <Link href="/admin/billing" className={styles.attentionRow}>
            <Icon file="762ef.svg" />
            <span>
              <strong>Review billing</strong>
              <small>Load current invoices from Stripe</small>
            </span>
            <Arrow />
          </Link>
        </section>
      </div>
      <section
        className={`${styles.panel} ${styles.usersPanel}`}
        aria-labelledby="recent-users-heading"
      >
        <div className={styles.panelHeading}>
          <h2 id="recent-users-heading">Recent users</h2>
          <Link className={styles.viewAll} href="/admin/users">
            View all users
          </Link>
        </div>
        <Table
          columns={["Name", "Plan", "Projects", "Joined", "Status"]}
          rows={userRows(report.users).slice(0, 4)}
          onDetail={onDetail}
          caption="Recent registered users"
        />
      </section>
    </>
  );
}

function Directory({
  tab,
  report,
  billing,
  query,
  days,
  initialStatus,
  onDetail,
  onRowsChange,
}: {
  tab: DirectoryTab;
  report: AdminReport;
  billing: BillingReport;
  query: string;
  days: number;
  initialStatus: string;
  onDetail: (detail: Detail) => void;
  onRowsChange: (columns: string[], rows: Row[]) => void;
}) {
  const config = useMemo(
    () => directory(tab, report, billing),
    [tab, report, billing],
  );
  const [status, setStatus] = useState(
    config.statuses.includes(initialStatus) ? initialStatus : "all",
  );
  const [sort, setSort] = useState("newest");
  const [pagination, setPagination] = useState({ page: 1, query, days });
  const setPage = (page: number) => setPagination({ page, query, days });
  const filtered = useMemo(
    () =>
      config.rows
        .filter(
          (row) =>
            (status === "all" || row.status === status) &&
            dateWithin(row.date, days) &&
            [row.title, row.subtitle, ...Object.values(row.fields)]
              .join(" ")
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.title.localeCompare(b.title)
            : sort === "oldest"
              ? a.date.localeCompare(b.date)
              : b.date.localeCompare(a.date),
        ),
    [config, status, days, query, sort],
  );
  // The parent exports precisely the filtered and sorted records, across pages.
  useEffect(() => {
    onRowsChange(config.columns, filtered);
  }, [config.columns, filtered, onRowsChange]);
  const pages = Math.max(1, Math.ceil(filtered.length / 5));
  const currentPage = Math.min(
    pagination.query === query && pagination.days === days
      ? pagination.page
      : 1,
    pages,
  );
  const first = (currentPage - 1) * 5;
  const count = (value: number) => value.toLocaleString();
  const reportNote = `Loaded records, last ${days} days`;
  const summaries: Record<DirectoryTab, ReactNode> = {
    users: (
      <>
        <Metric
          label="Users in directory"
          value={count(report.users.length)}
          note="Loaded registered accounts"
        />
        <Metric
          label="Verified active users"
          value={count(
            report.users.filter((user) => user.status === "Active").length,
          )}
          note="Confirmed accounts without an active ban"
        />
        <Metric
          label="Unverified users"
          value={count(
            report.users.filter((user) => user.status === "Unverified").length,
          )}
          note="Email verification is pending"
        />
      </>
    ),
    projects: (
      <>
        <Metric
          label="Active projects"
          value={count(report.overview.activeProjects)}
          note="Projects that have not been archived"
        />
        <Metric
          label="Draft projects"
          value={count(
            report.projects.filter((project) => project.status === "Draft")
              .length,
          )}
          note="Loaded projects in draft status"
        />
        <Metric
          label="Archived projects"
          value={count(
            report.projects.filter((project) => project.status === "Archived")
              .length,
          )}
          note="Retained project history"
        />
      </>
    ),
    usage: (
      <>
        <Metric
          label="AI tokens used"
          value={count(report.overview.tokensUsed)}
          note={reportNote}
        />
        <Metric
          label="Usage records"
          value={count(report.usage.length)}
          note="Settled provider usage events"
        />
        <Metric
          label="Projects with usage"
          value={count(
            new Set(report.usage.map((event) => event.project)).size,
          )}
          note={reportNote}
        />
      </>
    ),
    billing: (
      <>
        <Metric
          label="Invoices loaded"
          value={count(billing.invoices.length)}
          note="Current Stripe invoices"
        />
        <Metric
          label="Paid invoices"
          value={count(
            billing.invoices.filter((invoice) => invoice.status === "Paid")
              .length,
          )}
          note="Verified invoice status from Stripe"
        />
        <Metric
          label="Needs attention"
          value={count(
            billing.invoices.filter(
              (invoice) => invoice.status === "Needs attention",
            ).length,
          )}
          note="Invoices requiring review"
        />
      </>
    ),
    activity: (
      <>
        <Metric
          label="Recorded events"
          value={count(report.activity.length)}
          note={reportNote}
        />
        <Metric
          label="Project events"
          value={count(
            report.activity.filter((event) => event.category === "Projects")
              .length,
          )}
          note="Recorded project actions"
        />
        <Metric
          label="Administration events"
          value={count(
            report.activity.filter(
              (event) => event.category === "Administration",
            ).length,
          )}
          note="Recorded administrative actions"
        />
      </>
    ),
  };
  return (
    <>
      <div className={`${styles.metrics} ${styles.threeMetrics}`}>
        {summaries[tab]}
      </div>
      {tab === "billing" && !billing.configured && (
        <p className={styles.feedback} role="status">
          Stripe is not configured. Connect billing to load real invoices.
        </p>
      )}
      {tab === "billing" && billing.hasMore && (
        <p className={styles.feedback}>
          Showing the latest 100 Stripe invoices. More invoices are available in
          Stripe.
        </p>
      )}
      <section
        className={`${styles.panel} ${styles.directoryPanel}`}
        aria-labelledby="directory-heading"
      >
        <div className={styles.panelHeading}>
          <div>
            <h2 id="directory-heading">{config.label}</h2>
            <p>
              {filtered.length} {tab === "activity" ? "events" : "records"} in
              this view
            </p>
          </div>
          {tab === "billing" && (
            <Link href="/admin/billing/catalog" className={styles.viewAll}>
              Manage plan catalog <Arrow />
            </Link>
          )}
        </div>
        <div className={styles.filters}>
          <label>
            {tab === "activity" ? "Category" : "Status"}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">
                All {tab === "activity" ? "categories" : "statuses"}
              </option>
              {config.statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Sort by
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
          <span className={styles.filterHint}>Search from the bar above.</span>
        </div>
        <Table
          columns={config.columns}
          rows={filtered.slice(first, first + 5)}
          onDetail={onDetail}
          caption={config.label}
        />
        <div className={styles.pagination}>
          <span role="status">
            {filtered.length
              ? `${first + 1}–${Math.min(first + 5, filtered.length)} of ${filtered.length}`
              : "0 records"}
          </span>
          <div>
            <button
              type="button"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {pages}
            </span>
            <button
              type="button"
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </>
  );
}

function Settings({ account }: { account: CustomerAccount }) {
  const savedDays = useRangePreference();
  const [draftDays, setDraftDays] = useState<string | null>(null);
  const days = draftDays ?? String(savedDays);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    setSaved("");
    try {
      const result = await adminRequest<{ defaultRange: number }>(
        "/api/admin/settings",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultRange: Number(days) }),
        },
      );
      window.dispatchEvent(
        new CustomEvent("runly-admin-preferences", {
          detail: result.defaultRange,
        }),
      );
      setSaved("Dashboard preferences saved to your account.");
    } catch (error) {
      setSaved(
        error instanceof Error ? error.message : "Couldn't save preferences.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className={styles.settingsGrid}>
      <section className={`${styles.panel} ${styles.settingsPanel}`}>
        <h2>Administrator profile</h2>
        <p>Your verified account and access level.</p>
        <dl>
          <div>
            <dt>Name</dt>
            <dd>{account.displayName || "Administrator"}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{account.email}</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>
              <Badge>Administrator</Badge>
            </dd>
          </div>
        </dl>
        <Link className={styles.viewAll} href="/settings">
          Manage your account <Arrow />
        </Link>
      </section>
      <section className={`${styles.panel} ${styles.settingsPanel}`}>
        <h2>Dashboard preferences</h2>
        <p>
          Your account stores the default range for future dashboard visits.
        </p>
        <label className={styles.preference}>
          Default date range
          <select
            value={days}
            onChange={(e) => {
              setDraftDays(e.target.value);
              setSaved("");
            }}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </label>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => void save()}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save preferences"}
        </button>
        <p className={styles.feedback} role="status">
          {saved}
        </p>
      </section>
      <section
        className={`${styles.panel} ${styles.settingsPanel} ${styles.toolsPanel}`}
      >
        <h2>Administration tools</h2>
        <p>Configure the services supporting your workspace.</p>
        <div className={styles.toolLinks}>
          <Link href="/admin/billing/catalog">
            <Icon file="762ef.svg" />
            <span>
              <strong>Plan catalog</strong>
              <small>Manage configured products and billing limits.</small>
            </span>
            <Arrow />
          </Link>
          <Link href="/admin/ai-providers">
            <Icon file="89332.svg" />
            <span>
              <strong>AI providers</strong>
              <small>Review provider configuration.</small>
            </span>
            <Arrow />
          </Link>
          <Link href="/admin/legal">
            <Icon file="c3951.svg" />
            <span>
              <strong>Legal documents</strong>
              <small>Review the existing policy drafts.</small>
            </span>
            <Arrow />
          </Link>
        </div>
      </section>
    </div>
  );
}
function DetailDialog({
  detail,
  onClose,
}: {
  detail: Detail;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const trigger = document.activeElement;
    element?.showModal();
    return () => {
      element?.close();
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="admin-detail-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={styles.dialogHeading}>
        <div>
          <h2 id="admin-detail-title">{detail.title}</h2>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Close details"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <dl>
        {Object.entries(detail.fields).map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p>Details from the current administration report.</p>
      <button type="button" className={styles.primaryButton} onClick={onClose}>
        Done
      </button>
    </dialog>
  );
}

function exportCsv(columns: string[], rows: string[][], name: string) {
  const escape = (value: string) => {
    const safe = /^[=+@\-\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = [columns, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `runly-${name}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function AdminDashboard({
  tab,
  account,
  initialQuery = "",
  initialStatus = "",
}: {
  tab: AdminTab;
  account: CustomerAccount;
  initialQuery?: string;
  initialStatus?: string;
}) {
  const active = tabs.find((item) => item.id === tab) || tabs[0];
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [searchOpen, setSearchOpen] = useState(false);
  const savedDays = useRangePreference();
  const [selectedDays, setDays] = useState<number | null>(null);
  const days = selectedDays ?? savedDays;
  const [detail, setDetail] = useState<Detail | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [reportState, setReportState] = useState<{
    data: AdminReport | null;
    days: number;
    error: string;
  }>({ data: null, days: 0, error: "" });
  const [billingState, setBillingState] = useState<{
    data: BillingReport | null;
    error: string;
  }>({ data: null, error: "" });
  const [reload, setReload] = useState(0);
  const [actionError, setActionError] = useState("");
  const [exporting, setExporting] = useState(false);
  const exportRows = useRef<{ columns: string[]; rows: Row[] }>({
    columns: [],
    rows: [],
  });
  const searchBox = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const initials = (account.displayName || account.email)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const isInfrastructure = tab === "swiftlet" || tab === "nests";
  const isDirectory =
    tab !== "overview" && tab !== "settings" && !isInfrastructure;
  useEffect(() => {
    if (isInfrastructure || tab === "settings") return;
    const controller = new AbortController();
    adminRequest<AdminReport>(`/api/admin/overview?days=${days}`, {
      signal: controller.signal,
    })
      .then((data) => setReportState({ data, days, error: "" }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setReportState({
            data: null,
            days,
            error:
              error instanceof Error ? error.message : "Couldn't load reports.",
          });
      });
    return () => controller.abort();
  }, [days, isInfrastructure, tab, reload]);
  useEffect(() => {
    if (tab !== "billing") return;
    const controller = new AbortController();
    adminRequest<BillingReport>("/api/admin/billing", {
      signal: controller.signal,
    })
      .then((data) => setBillingState({ data, error: "" }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setBillingState({
            data: null,
            error:
              error instanceof Error
                ? error.message
                : "Couldn't load invoices.",
          });
      });
    return () => controller.abort();
  }, [tab, reload]);
  const report = reportState.days === days ? reportState.data : null;
  const reportError = reportState.days === days ? reportState.error : "";
  const loading =
    !isInfrastructure && tab !== "settings" && !report && !reportError;
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        setSearchOpen(false);
        if (mobileOpen) menuButton.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!searchBox.current?.contains(event.target as Node))
        setSearchOpen(false);
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [mobileOpen]);
  const onRowsChange = useCallback((columns: string[], rows: Row[]) => {
    exportRows.current = { columns, rows };
  }, []);
  async function handleExport() {
    if (!report || exporting) return;
    setExporting(true);
    setActionError("");
    const data = isDirectory
      ? {
          columns: exportRows.current.columns,
          rows: exportRows.current.rows.map((row) => [
            row.title,
            ...row.cells,
            row.status,
          ]),
        }
      : {
          columns: ["Metric", "Value", "Note"],
          rows: [
            [
              "Total users",
              String(report.overview.users),
              "Loaded account directory",
            ],
            [
              "Active projects",
              String(report.overview.activeProjects),
              "Projects that have not been archived",
            ],
            [
              "AI tokens used",
              String(report.overview.tokensUsed),
              `Last ${days} days`,
            ],
            [
              "Recorded events",
              String(report.activity.length),
              `Last ${days} days`,
            ],
          ],
        };
    try {
      await adminRequest("/api/admin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resource: tab,
          days,
          rowCount: data.rows.length,
        }),
      });
      exportCsv(data.columns, data.rows, tab);
      setAnnouncement(`Exported ${data.rows.length} records as CSV.`);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Couldn't export this report.",
      );
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className={`admin-surface ${styles.root}`}>
      <Link className={styles.skip} href="#admin-content">
        Skip to admin content
      </Link>
      <aside className={styles.sidebar}>
        <div className={styles.brandRow}>
          <Brand className={styles.brand} logoSrc={asset("b9eb4.png")} />
          <span className={styles.adminBadge}>ADMIN</span>
          <button
            ref={menuButton}
            type="button"
            className={styles.menuButton}
            aria-label={
              mobileOpen ? "Close admin navigation" : "Open admin navigation"
            }
            aria-expanded={mobileOpen}
            aria-controls="admin-navigation"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        <div
          className={`${styles.sidebarBody} ${mobileOpen ? styles.sidebarOpen : ""}`}
        >
          <Link href="/dashboard/projects" className={styles.workspaceLink}>
            Personal workspace <Icon file="6734f.svg" size={20} />
          </Link>
          <nav
            id="admin-navigation"
            aria-label="Admin navigation"
            className={styles.navigation}
          >
            {tabs.map((item) => {
              const NavIcon = item.icon;
              return (
                <Link
                  key={item.id}
                  href={item.id === "overview" ? "/admin" : `/admin/${item.id}`}
                  aria-current={tab === item.id ? "page" : undefined}
                  onClick={() => setMobileOpen(false)}
                >
                  {typeof NavIcon === "string" ? (
                    <Icon file={NavIcon} />
                  ) : (
                    <NavIcon size={18} aria-hidden="true" />
                  )}
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Link href="/admin/settings" className={styles.sidebarProfile}>
            <span
              className={styles.sidebarAvatar}
              style={
                account.avatarUrl
                  ? { backgroundImage: `url(${account.avatarUrl})` }
                  : undefined
              }
            >
              {!account.avatarUrl && initials}
            </span>
            <span>
              <strong>{account.displayName || "Administrator"}</strong>
              <small>Administrator</small>
            </span>
          </Link>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <span>Administration</span>
          <div ref={searchBox} className={styles.searchBox}>
            <label className={styles.search}>
              <Icon file="b0bca.svg" />
              <input
                type="search"
                aria-label={
                  tab === "nests"
                    ? "Search Nests"
                    : isDirectory
                      ? `Search ${active.label.toLowerCase()}`
                      : "Search users and projects"
                }
                placeholder={
                  tab === "nests"
                    ? "Search Nests…"
                    : isDirectory
                      ? `Search ${active.label.toLowerCase()}…`
                      : "Search users, projects…"
                }
                value={query}
                maxLength={200}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearchOpen(true);
                }}
              />
            </label>
            {searchOpen && query.trim() && !isDirectory && tab !== "nests" && (
              <div className={styles.searchResults}>
                <Link href={`/admin/users?q=${encodeURIComponent(query)}`}>
                  Search users for “{query}” <Arrow />
                </Link>
                <Link href={`/admin/projects?q=${encodeURIComponent(query)}`}>
                  Search projects for “{query}” <Arrow />
                </Link>
              </div>
            )}
          </div>
          <Link
            href="/admin/settings"
            aria-label="Open admin profile"
            className={styles.topAvatar}
            style={
              account.avatarUrl
                ? { backgroundImage: `url(${account.avatarUrl})` }
                : undefined
            }
          >
            {!account.avatarUrl && initials}
          </Link>
        </header>
        <main id="admin-content" className={styles.content}>
          <div className={styles.pageHeading}>
            <div>
              <h1>{active.title}</h1>
              <p>{active.description}</p>
            </div>
            <div className={styles.pageActions}>
              {tab !== "settings" && !isInfrastructure && (
                <>
                  <label className={styles.dateRange}>
                    <span className={styles.srOnly}>
                      Date range for recorded data
                    </span>
                    <select
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value))}
                    >
                      <option value={7}>Last 7 days</option>
                      <option value={30}>Last 30 days</option>
                      <option value={90}>Last 90 days</option>
                    </select>
                    <Icon file="6734f.svg" size={20} />
                  </label>
                  <button
                    type="button"
                    className={styles.exportButton}
                    onClick={() => void handleExport()}
                    disabled={
                      !report ||
                      exporting ||
                      (tab === "billing" && !billingState.data)
                    }
                  >
                    {exporting ? "Exporting…" : "Export"}
                  </button>
                </>
              )}
            </div>
          </div>
          <span className={styles.srOnly} role="status">
            {announcement}
          </span>
          {actionError && (
            <p role="alert" className={styles.feedback}>
              {actionError}
            </p>
          )}
          {loading && (
            <p role="status" className={styles.feedback}>
              Loading administration data…
            </p>
          )}
          {reportError && (
            <div role="alert" className={styles.feedback}>
              <p>{reportError}</p>
              <button
                className={styles.primaryButton}
                onClick={() => setReload((value) => value + 1)}
              >
                Retry
              </button>
            </div>
          )}
          {tab === "overview" && report ? (
            <Overview days={days} report={report} onDetail={setDetail} />
          ) : tab === "swiftlet" ? (
            <AdminSwiftlet />
          ) : tab === "nests" ? (
            <AdminNests query={query} />
          ) : tab === "settings" ? (
            <Settings account={account} />
          ) : tab === "billing" && billingState.error ? (
            <p role="alert" className={styles.feedback}>
              {billingState.error}
            </p>
          ) : tab === "billing" && !billingState.data ? (
            <p role="status" className={styles.feedback}>
              Loading Stripe invoices…
            </p>
          ) : isDirectory && report ? (
            <Directory
              tab={tab as DirectoryTab}
              report={report}
              billing={billingState.data || emptyBilling}
              query={query}
              days={days}
              initialStatus={initialStatus}
              onDetail={setDetail}
              onRowsChange={onRowsChange}
            />
          ) : null}
          {!isInfrastructure && (
            <footer className={styles.footer}>
              {tab === "settings"
                ? "Dashboard preferences are saved to your administrator account."
                : report?.truncated
                  ? `Reports include up to ${report.limit.toLocaleString()} rows per source. Some results are truncated; filters and exports use loaded records.`
                  : report
                    ? `Reports include up to ${report.limit.toLocaleString()} rows per source. Search and exports use the loaded records.`
                    : "Administration data is loaded from connected services."}
            </footer>
          )}
        </main>
      </div>
      {detail && (
        <DetailDialog detail={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}
