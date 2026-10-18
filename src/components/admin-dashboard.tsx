"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, Network, Server, X, type LucideIcon } from "lucide-react";
import { Brand } from "./brand";
import type { CustomerAccount } from "./customer-header";
import {
  adminUsers,
  adminProjects,
  adminUsage,
  adminInvoices,
  adminActivity,
  creationActivity,
} from "./admin-sample-data";
import styles from "./admin-dashboard.module.css";
import { AdminSwiftlet, AdminNests } from "./admin-infrastructure";
import { isInfrastructureMock } from "./admin-infrastructure-state";

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
function subscribeRangePreference(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("runly-admin-preferences", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("runly-admin-preferences", callback);
  };
}
function rangePreference() {
  try {
    const value = Number(localStorage.getItem("runly-admin-range"));
    return [7, 30, 90].includes(value) ? value : 30;
  } catch {
    return 30;
  }
}
function useRangePreference() {
  return useSyncExternalStore(
    subscribeRangePreference,
    rangePreference,
    () => 30,
  );
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
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
const dateWithin = (date: string, days: number) =>
  Date.parse(`${date}T12:00:00Z`) >=
  Date.parse("2026-10-02T12:00:00Z") - (days - 1) * 86400000;

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
function userRows(): Row[] {
  return adminUsers.map((user) => ({
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
function directory(tab: DirectoryTab): {
  columns: string[];
  rows: Row[];
  statuses: string[];
  label: string;
} {
  if (tab === "users")
    return {
      columns: ["Name", "Plan", "Projects", "Joined", "Status"],
      rows: userRows(),
      statuses: ["Active", "Invited", "Inactive"],
      label: "All users",
    };
  if (tab === "projects")
    return {
      columns: ["Project", "Owner", "Type", "Updated", "Status"],
      statuses: ["Published", "In progress", "Draft", "Failed"],
      label: "All projects",
      rows: adminProjects.map((project) => ({
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
      columns: ["Project", "User", "Credits", "Date", "Status"],
      statuses: ["Completed", "Failed"],
      label: "Usage history",
      rows: adminUsage.map((job) => ({
        id: job.id,
        title: job.project,
        subtitle: job.id,
        cells: [
          job.user,
          job.credits.toLocaleString("en-US"),
          dateText(job.date),
        ],
        status: job.status,
        date: job.date,
        fields: {
          Job: job.id,
          User: job.user,
          Type: job.type,
          Credits: job.credits.toLocaleString("en-US"),
          Date: dateText(job.date),
          Status: job.status,
          ...(job.status === "Failed"
            ? { Result: "Sample export failure. No credits charged." }
            : {}),
        },
      })),
    };
  if (tab === "billing")
    return {
      columns: ["Invoice", "Customer", "Plan", "Amount", "Status"],
      statuses: ["Paid", "Needs attention"],
      label: "Recent invoices",
      rows: adminInvoices.map((invoice) => ({
        id: invoice.id,
        title: invoice.id,
        subtitle: dateText(invoice.date),
        cells: [invoice.user, invoice.plan, money(invoice.amount)],
        status: invoice.status,
        date: invoice.date,
        fields: {
          Invoice: invoice.id,
          Customer: invoice.user,
          Plan: invoice.plan,
          Amount: money(invoice.amount),
          Date: dateText(invoice.date),
          Status: invoice.status,
        },
      })),
    };
  return {
    columns: ["Event", "Actor", "Subject", "Date", "Category"],
    statuses: ["Users", "Projects", "AI usage", "Billing"],
    label: "Workspace events",
    rows: adminActivity.map((event) => ({
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

function CreationChart({ days }: { days: number }) {
  const [videoVisible, setVideoVisible] = useState(true);
  const [webVisible, setWebVisible] = useState(true);
  const data = days === 7 ? creationActivity.slice(-2) : creationActivity;
  return (
    <section
      className={`${styles.panel} ${styles.chartPanel}`}
      aria-labelledby="creation-heading"
    >
      <div className={styles.panelHeading}>
        <div>
          <h2 id="creation-heading">Creation activity</h2>
          <p>Projects created each week</p>
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
          aria-label={`Illustrative creation activity. ${videoVisible ? "Blue bars show videos." : "Videos hidden."} ${webVisible ? "Green bars show websites and apps." : "Websites and apps hidden."} The values are available in the table below.`}
        >
          <div className={styles.axis} aria-hidden="true">
            {[90, 60, 30, 0].map((n) => (
              <span key={n}>{n}</span>
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
                        height: `${(point.videos / 90) * 100}%`,
                        opacity: videoVisible ? 1 : 0,
                      }}
                    />
                    <span
                      className={styles.webBar}
                      style={{
                        height: `${(point.websites / 90) * 100}%`,
                        opacity: webVisible ? 1 : 0,
                      }}
                    />
                  </div>
                  <span className={styles.chartDate}>
                    {index % 2 === 0 || data.length === 2 ? point.date : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <table className={styles.srOnly}>
        <caption>Illustrative creation activity values</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Videos</th>
            <th>Websites and apps</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p) => (
            <tr key={p.date}>
              <th>{p.date}</th>
              <td>{videoVisible ? p.videos : "Hidden"}</td>
              <td>{webVisible ? p.websites : "Hidden"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function Overview({
  days,
  onDetail,
}: {
  days: number;
  onDetail: (detail: Detail) => void;
}) {
  return (
    <>
      <div className={styles.metrics}>
        <Metric
          label="Total users"
          value="1,284"
          note="+84 this month"
          positive
        />
        <Metric
          label="Active projects"
          value="326"
          note="Across all creation types"
        />
        <Metric
          label="AI credits used"
          value="42,860"
          note="Of 60,000 workspace credits"
        />
        <Metric
          label="Monthly revenue"
          value="$8,420"
          note="Illustrative billing total"
        />
      </div>
      <div className={styles.overviewGrid}>
        <CreationChart days={days} />
        <section
          className={`${styles.panel} ${styles.attention}`}
          aria-labelledby="attention-heading"
        >
          <div className={styles.panelHeading}>
            <h2 id="attention-heading">Needs attention</h2>
            <span className={styles.attentionCount}>3 items</span>
          </div>
          <Link
            href="/admin/usage?status=Failed"
            className={styles.attentionRow}
          >
            <Icon file="93bca.svg" />
            <span>
              <strong>2 failed video exports</strong>
              <small>Review export details</small>
            </span>
            <Arrow />
          </Link>
          <Link
            href="/admin/billing?status=Needs%20attention"
            className={styles.attentionRow}
          >
            <Icon file="93bca.svg" />
            <span>
              <strong>1 payment needs attention</strong>
              <small>Open billing details</small>
            </span>
            <Arrow />
          </Link>
          <Link href="/admin/activity" className={styles.attentionRow}>
            <Icon file="6c60b.svg" />
            <span>
              <strong>All systems operational</strong>
              <small>Illustrative system status</small>
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
          rows={userRows().slice(0, 4)}
          onDetail={onDetail}
          caption="Recent illustrative users"
        />
      </section>
    </>
  );
}

function Directory({
  tab,
  query,
  days,
  initialStatus,
  onDetail,
  onRowsChange,
}: {
  tab: DirectoryTab;
  query: string;
  days: number;
  initialStatus: string;
  onDetail: (detail: Detail) => void;
  onRowsChange: (columns: string[], rows: Row[]) => void;
}) {
  const config = useMemo(() => directory(tab), [tab]);
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
  const summaries: Record<DirectoryTab, ReactNode> = {
    users: (
      <>
        <Metric label="Total users" value="1,284" note="Across the workspace" />
        <Metric
          label="Active users"
          value="1,172"
          note="Illustrative account total"
        />
        <Metric
          label="Pending invitations"
          value="12"
          note="Awaiting acceptance"
        />
      </>
    ),
    projects: (
      <>
        <Metric
          label="Active projects"
          value="326"
          note="Across all creation types"
        />
        <Metric label="Published" value="214" note="Shared with the world" />
        <Metric label="Needs attention" value="2" note="Failed video exports" />
      </>
    ),
    usage: (
      <>
        <Metric
          label="AI credits used"
          value="42,860"
          note="Illustrative usage total"
        />
        <Metric
          label="Workspace allowance"
          value="60,000"
          note="Sample credit allowance"
        />
        <Metric label="Failed jobs" value="2" note="No credits charged" />
      </>
    ),
    billing: (
      <>
        <Metric
          label="Monthly revenue"
          value="$8,420"
          note="Illustrative billing total"
        />
        <Metric
          label="Paid subscriptions"
          value="284"
          note="Creator and Studio samples"
        />
        <Metric label="Needs attention" value="1" note="Payment to review" />
      </>
    ),
    activity: (
      <>
        <Metric
          label="Workspace events"
          value="128"
          note="Illustrative activity total"
        />
        <Metric
          label="Project changes"
          value="84"
          note="Created, updated, or published"
        />
        <Metric
          label="Account changes"
          value="32"
          note="Signups and invitations"
        />
      </>
    ),
  };
  return (
    <>
      <div className={`${styles.metrics} ${styles.threeMetrics}`}>
        {summaries[tab]}
      </div>
      {tab === "usage" && (
        <section
          className={styles.usageAllowance}
          aria-label="Illustrative credit allowance"
        >
          <div>
            <strong>Workspace credit allowance</strong>
            <span>42,860 / 60,000 credits · 71.4%</span>
          </div>
          <progress max={60000} value={42860}>
            71.4%
          </progress>
          <Link href="/admin/ai-providers">
            Manage AI providers <Arrow />
          </Link>
        </section>
      )}
      <section
        className={`${styles.panel} ${styles.directoryPanel}`}
        aria-labelledby="directory-heading"
      >
        <div className={styles.panelHeading}>
          <div>
            <h2 id="directory-heading">{config.label}</h2>
            <p>
              {filtered.length} sample{" "}
              {tab === "activity" ? "events" : "records"} in this view
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
          caption={`${config.label}, illustrative data`}
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
  function save() {
    try {
      localStorage.setItem("runly-admin-range", days);
      window.dispatchEvent(new Event("runly-admin-preferences"));
      setSaved("Dashboard preferences saved on this device.");
    } catch {
      setSaved(
        "Your browser couldn't save these preferences. Please try again.",
      );
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
        <p>Changes apply to this dashboard on your current device.</p>
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
        <button type="button" className={styles.primaryButton} onClick={save}>
          Save preferences
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
          <span className={styles.sampleBadge}>Sample data</span>
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
      <p>
        This illustrative record cannot change a real account, project, or
        payment.
      </p>
      <button type="button" className={styles.primaryButton} onClick={onClose}>
        Done
      </button>
    </dialog>
  );
}

function exportCsv(columns: string[], rows: string[][], name: string) {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const csv = [columns, ...rows]
    .map((row) => row.map(escape).join(","))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `runly-${name}-sample.csv`;
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
  function handleExport() {
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
            ["Total users", "1284", "Illustrative workspace total"],
            ["Active projects", "326", "Across all creation types"],
            ["AI credits used", "42860", "Of 60000 sample credits"],
            ["Monthly revenue", "8420", "Illustrative USD total"],
          ],
        };
    exportCsv(data.columns, data.rows, tab);
    setAnnouncement(
      `Exported ${data.rows.length} illustrative records as CSV.`,
    );
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
              {isInfrastructure && isInfrastructureMock && (
                <span className={styles.sampleBadge}>Mock data</span>
              )}
              {tab !== "settings" && !isInfrastructure && (
                <span className={styles.sampleBadge}>Sample data</span>
              )}
              {tab !== "settings" && !isInfrastructure && (
                <>
                  <label className={styles.dateRange}>
                    <span className={styles.srOnly}>
                      Date range for sample data
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
                    onClick={handleExport}
                  >
                    Export
                  </button>
                </>
              )}
            </div>
          </div>
          <span className={styles.srOnly} role="status">
            {announcement}
          </span>
          {tab === "overview" ? (
            <Overview days={days} onDetail={setDetail} />
          ) : tab === "swiftlet" ? (
            <AdminSwiftlet />
          ) : tab === "nests" ? (
            <AdminNests query={query} />
          ) : tab === "settings" ? (
            <Settings account={account} />
          ) : (
            <Directory
              tab={tab}
              query={query}
              days={days}
              initialStatus={initialStatus}
              onDetail={setDetail}
              onRowsChange={onRowsChange}
            />
          )}
          {!isInfrastructure && (
            <footer className={styles.footer}>
              {tab === "settings"
                ? "Dashboard preferences are saved only on this device."
                : "All metrics and accounts shown are illustrative. Sample period ending October 2, 2026."}
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
