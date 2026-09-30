"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  RefreshCw,
  ShieldCheck,
  TicketPercent,
  Users,
} from "lucide-react";
import { AppShell } from "./app-shell";
import {
  BranchedMenu,
  CallChip,
  CodeSlots,
  CometDial,
  FlexCarousel,
} from "./react-bits";
import styles from "./admin-operations.module.css";

type Summary = Record<string, number>;
type RequestLog = {
  id: string;
  user_id: string;
  email: string;
  projectName: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  ai_cost_micros: number;
  sandbox_cost_micros: number;
  latency_ms: number;
  tools_used: string[];
  tool_calls: number;
  files_edited: number;
  commands_run: number;
  agent_retries: number;
  success: boolean;
  rate_limited: boolean;
  error: string | null;
  created_at: string;
};
type CostRow = {
  userId: string;
  email: string;
  plan: string;
  planPriceMicros: number;
  aiCostMicros: number;
  sandboxCostMicros: number;
  totalCostMicros: number;
  profitMicros: number;
  totalTokens: number;
  limitUsagePercent: number;
  extraTokens: number;
  suspended: boolean;
  overSubscriptionCost: boolean;
};
type MonitoringData = {
  summary: Summary;
  series: Array<{
    date: string;
    requests: number;
    tokens: number;
    cost: number;
    errors: number;
    profitMicros: number;
  }>;
  costAbuse: CostRow[];
  requests: RequestLog[];
  sandboxes: Array<{
    project_id: string;
    projectName: string;
    status: string;
    state: string;
    runtimeMs: number;
    cpu_percent: number | null;
    ram_mb: number | null;
    error: string | null;
  }>;
  filters: {
    users: Array<{ id: string; email: string }>;
    projects: Array<{ id: string; name: string }>;
    plans: Array<{ id: string; name: string }>;
  };
};

function useDismissDetails() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOnPointer = (event: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(event.target as Node))
        ref.current.removeAttribute("open");
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.removeAttribute("open");
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);
  return ref;
}

function FilterDropdown({
  label,
  value,
  fallback,
  options,
  onChange,
}: {
  label: string;
  value: string;
  fallback: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const detailsRef = useDismissDetails();
  const selected = options.find((option) => option.value === value)?.label;
  return (
    <details className={styles.filterDropdown} ref={detailsRef}>
      <summary>
        <span>
          <small>{label}</small>
          {selected || fallback}
        </span>
        <ChevronDown size={18} />
      </summary>
      <div className={styles.filterPanel}>
        {[{ value: "", label: fallback }, ...options].map((option) => (
          <button
            type="button"
            key={option.value || "all"}
            className={value === option.value ? styles.selectedOption : ""}
            onClick={(event) => {
              onChange(option.value);
              event.currentTarget.closest("details")?.removeAttribute("open");
            }}
          >
            {option.label}
            {value === option.value && <Check size={16} />}
          </button>
        ))}
      </div>
    </details>
  );
}

function DateRangeDropdown({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}) {
  const detailsRef = useDismissDetails();
  const [draft, setDraft] = useState({ from, to });
  const display = `${new Date(`${from}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(`${to}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  return (
    <details
      className={`${styles.filterDropdown} ${styles.dateDropdown}`}
      ref={detailsRef}
      onToggle={(event) => {
        if (event.currentTarget.open) setDraft({ from, to });
      }}
    >
      <summary>
        <span>
          <small>Date range</small>
          {display}
        </span>
        <CalendarDays size={18} />
      </summary>
      <div className={`${styles.filterPanel} ${styles.datePanel}`}>
        <label>
          From
          <input
            type="date"
            max={draft.to}
            value={draft.from}
            onChange={(event) =>
              setDraft((value) => ({ ...value, from: event.target.value }))
            }
          />
        </label>
        <label>
          To
          <input
            type="date"
            min={draft.from}
            value={draft.to}
            onChange={(event) =>
              setDraft((value) => ({ ...value, to: event.target.value }))
            }
          />
        </label>
        <button
          type="button"
          className={styles.applyDate}
          disabled={!draft.from || !draft.to || draft.from > draft.to}
          onClick={(event) => {
            onChange(draft);
            event.currentTarget.closest("details")?.removeAttribute("open");
          }}
        >
          Apply range
        </button>
      </div>
    </details>
  );
}

const money = (micros: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format((micros || 0) / 1_000_000);
const compact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);

export function AdminMonitoring() {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(() => ({
    from: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    user: "",
    project: "",
    plan: "",
  }));
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({
        from: new Date(`${filters.from}T00:00:00`).toISOString(),
        to: new Date(`${filters.to}T23:59:59.999`).toISOString(),
      });
      if (filters.user) query.set("user", filters.user);
      if (filters.project) query.set("project", filters.project);
      if (filters.plan) query.set("plan", filters.plan);
      const response = await fetch(`/api/admin/monitoring?${query}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setData(result);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't load monitoring data.",
      );
    } finally {
      setLoading(false);
    }
  }, [filters]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 150);
    return () => clearTimeout(timer);
  }, [load]);
  const maxUsage = Math.max(
    0,
    ...(data?.costAbuse.map((row) => row.limitUsagePercent) || [0]),
  );
  return (
    <AppShell title="AI Monitoring" eyebrow="Admin preview">
      <div className="notice" role="status">
        <AlertTriangle />
        The current runtime does not write detailed request or cost telemetry.
        Figures here cover existing logs only and omit newer tasks.
      </div>
      <div className={styles.toolbar}>
        <div>
          <h2>Cost, reliability, and abuse signals</h2>
          <p>Historical request logs and workspace state where available.</p>
        </div>
        <button
          className="button button-outline"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={19} /> Refresh
        </button>
      </div>
      <div className={styles.filters}>
        <DateRangeDropdown
          from={filters.from}
          to={filters.to}
          onChange={(range) => setFilters((value) => ({ ...value, ...range }))}
        />
        <FilterDropdown
          label="User"
          value={filters.user}
          fallback="All users"
          options={(data?.filters.users || []).map((user) => ({
            value: user.id,
            label: user.email,
          }))}
          onChange={(user) => setFilters((value) => ({ ...value, user }))}
        />
        <FilterDropdown
          label="Project"
          value={filters.project}
          fallback="All projects"
          options={(data?.filters.projects || []).map((project) => ({
            value: project.id,
            label: project.name,
          }))}
          onChange={(project) => setFilters((value) => ({ ...value, project }))}
        />
        <FilterDropdown
          label="Plan"
          value={filters.plan}
          fallback="All plans"
          options={(data?.filters.plans || []).map((plan) => ({
            value: plan.id,
            label: plan.name,
          }))}
          onChange={(plan) => setFilters((value) => ({ ...value, plan }))}
        />
      </div>
      {loading && !data ? (
        <div className={styles.loading}>
          <span role="status">Loading monitoring data…</span>
        </div>
      ) : error ? (
        <div className="notice">
          <AlertTriangle />
          {error}
        </div>
      ) : (
        data && (
          <>
            <section className={styles.heroMetrics}>
              <CometDial
                value={data.summary.successRate || 0}
                label="Success rate"
                detail={`${data.summary.requests || 0} requests`}
              />
              <CodeSlots
                items={[
                  {
                    label: "Active sessions",
                    value: data.summary.activeSessions || 0,
                  },
                  {
                    label: "Total tokens",
                    value: compact(data.summary.totalTokens),
                  },
                  { label: "AI cost", value: money(data.summary.aiCostMicros) },
                  {
                    label: "Sandbox cost",
                    value: money(data.summary.sandboxCostMicros),
                  },
                  {
                    label: "Cost / user",
                    value: money(data.summary.costPerUserMicros),
                  },
                  {
                    label: "Response",
                    value: `${data.summary.averageLatencyMs || 0}ms`,
                  },
                  {
                    label: "Rate limits",
                    value: data.summary.rateLimitErrors || 0,
                  },
                  { label: "Retries", value: data.summary.agentRetries || 0 },
                ]}
              />
            </section>
            <section className={styles.charts}>
              <Chart
                title="Usage"
                data={data.series.map((point) => point.tokens)}
                labels={data.series.map((point) => point.date)}
                format={compact}
              />
              <Chart
                title="Total cost"
                data={data.series.map((point) => point.cost)}
                labels={data.series.map((point) => point.date)}
                format={money}
              />
              <Chart
                title="Requests"
                data={data.series.map((point) => point.requests)}
                labels={data.series.map((point) => point.date)}
                format={compact}
              />
              <Chart
                title="Errors"
                data={data.series.map((point) => point.errors)}
                labels={data.series.map((point) => point.date)}
                format={compact}
              />
              <Chart
                title="Estimated profit"
                data={data.series.map((point) => point.profitMicros)}
                labels={data.series.map((point) => point.date)}
                format={money}
              />
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Sandboxes</h2>
                  <p>
                    Active, sleeping, crashed, resource samples, and running
                    cost.
                  </p>
                </div>
              </div>
              <FlexCarousel label="Sandbox status">
                {data.sandboxes.map((sandbox) => (
                  <article className={styles.sandbox} key={sandbox.project_id}>
                    <div>
                      <strong>{sandbox.projectName}</strong>
                      <CallChip
                        label={sandbox.status}
                        tone={
                          sandbox.status === "crashed"
                            ? "bad"
                            : sandbox.status === "active"
                              ? "good"
                              : "neutral"
                        }
                      />
                    </div>
                    <CodeSlots
                      items={[
                        {
                          label: "CPU",
                          value:
                            sandbox.cpu_percent === null
                              ? "Unavailable"
                              : `${sandbox.cpu_percent}%`,
                        },
                        {
                          label: "RAM",
                          value:
                            sandbox.ram_mb === null
                              ? "Unavailable"
                              : `${sandbox.ram_mb} MB`,
                        },
                        {
                          label: "Runtime",
                          value: `${Math.round(sandbox.runtimeMs / 60000)} min`,
                        },
                      ]}
                    />
                    {sandbox.error && <p>{sandbox.error}</p>}
                  </article>
                ))}
              </FlexCarousel>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Cost & Abuse</h2>
                  <p>
                    {data.summary.overSubscriptionUsers || 0} users cost more
                    than their current subscription.
                  </p>
                </div>
                <CallChip
                  label="Peak limit use"
                  value={`${Math.round(maxUsage)}%`}
                  tone={maxUsage > 100 ? "bad" : "neutral"}
                />
              </div>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Plan price</th>
                      <th>AI cost</th>
                      <th>Sandbox</th>
                      <th>Total</th>
                      <th>Profit / loss</th>
                      <th>Tokens</th>
                      <th>Limit use</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.costAbuse.map((row) => (
                      <tr
                        className={row.overSubscriptionCost ? styles.loss : ""}
                        key={row.userId}
                      >
                        <td>
                          <strong>{row.email}</strong>
                          <small>{row.plan}</small>
                        </td>
                        <td>{money(row.planPriceMicros)}</td>
                        <td>{money(row.aiCostMicros)}</td>
                        <td>{money(row.sandboxCostMicros)}</td>
                        <td>{money(row.totalCostMicros)}</td>
                        <td>{money(row.profitMicros)}</td>
                        <td>{compact(row.totalTokens)}</td>
                        <td>{Math.round(row.limitUsagePercent)}%</td>
                        <td>
                          <CallChip
                            label={
                              row.suspended
                                ? "Suspended"
                                : row.overSubscriptionCost
                                  ? "Review"
                                  : "Healthy"
                            }
                            tone={
                              row.suspended || row.overSubscriptionCost
                                ? "bad"
                                : "good"
                            }
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div>
                  <h2>Request log</h2>
                  <p>
                    Tokens, cost, latency, tools, file edits, commands,
                    outcomes, and timestamps.
                  </p>
                </div>
              </div>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User / project</th>
                      <th>Tokens</th>
                      <th>Cost</th>
                      <th>Latency</th>
                      <th>Activity</th>
                      <th>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.requests.map((request) => (
                      <tr key={request.id}>
                        <td>{new Date(request.created_at).toLocaleString()}</td>
                        <td>
                          <strong>{request.email}</strong>
                          <small>{request.projectName}</small>
                        </td>
                        <td>
                          {compact(request.total_tokens)}
                          <small>
                            {compact(request.input_tokens)} in ·{" "}
                            {compact(request.output_tokens)} out
                          </small>
                        </td>
                        <td>
                          {money(
                            request.ai_cost_micros +
                              request.sandbox_cost_micros,
                          )}
                        </td>
                        <td>{request.latency_ms}ms</td>
                        <td>
                          <div className={styles.chips}>
                            <CallChip
                              label="tools"
                              value={request.tool_calls}
                            />
                            <CallChip
                              label="files"
                              value={request.files_edited}
                            />
                            <CallChip
                              label="commands"
                              value={request.commands_run}
                            />
                          </div>
                        </td>
                        <td>
                          {request.success ? (
                            <CallChip label="Success" tone="good" />
                          ) : (
                            <details>
                              <summary>
                                <CallChip
                                  label={
                                    request.rate_limited
                                      ? "Rate limited"
                                      : "Failed"
                                  }
                                  tone="bad"
                                />
                              </summary>
                              <p>
                                {request.error ||
                                  "No provider error was returned."}
                              </p>
                              <code>{JSON.stringify(request.tools_used)}</code>
                            </details>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )
      )}
    </AppShell>
  );
}

function Chart({
  title,
  data,
  labels,
  format,
}: {
  title: string;
  data: number[];
  labels: string[];
  format: (value: number) => string;
}) {
  const minimum = Math.min(0, ...data);
  const maximum = Math.max(0, ...data);
  const range = Math.max(maximum - minimum, 1);
  const baseline = 46 - ((0 - minimum) / range) * 40;
  const points = data
    .map(
      (value, index) =>
        `${data.length < 2 ? 50 : (index / (data.length - 1)) * 100},${46 - ((value - minimum) / range) * 40}`,
    )
    .join(" ");
  const chartPoints = points || `0,${baseline} 100,${baseline}`;
  return (
    <article className={styles.chart}>
      <div>
        <h3>{title}</h3>
        <strong>{format(data.at(-1) || 0)}</strong>
      </div>
      <svg
        viewBox="0 0 100 52"
        role="img"
        aria-label={`${title} from ${labels[0] || "start"} to ${labels.at(-1) || "today"}`}
        preserveAspectRatio="none"
      >
        <path d={`M0 ${baseline}H100`} />
        <polygon points={`0,${baseline} ${chartPoints} 100,${baseline}`} />
        <polyline points={chartPoints} />
      </svg>
      <small>{labels.at(-1) || "No data yet"}</small>
    </article>
  );
}

type AdminUser = {
  id: string;
  email?: string;
  displayName: string;
  role: string;
  plan: string | null;
  suspended?: boolean;
  extra_tokens?: number;
  lastSignInAt?: string;
};
type AdminPlan = {
  id: string;
  name: string;
  active: boolean;
  price_cents: number | null;
};
export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [workingUser, setWorkingUser] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) {
      setUsers(result.users);
      setPlans(result.plans || []);
    } else setError(result.message);
    setLoading(false);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function action(payload: Record<string, unknown>) {
    setError("");
    setMessage("");
    setWorkingUser(String(payload.userId || ""));
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) setError(result.message);
      else {
        setMessage("Administrator role updated.");
        await load();
      }
    } finally {
      setWorkingUser("");
    }
  }
  return (
    <AppShell title="Users" eyebrow="Admin access">
      <div className={styles.toolbar}>
        <div>
          <h2>Accounts and AI access</h2>
          <p>
            View account plans and manage administrator roles. AI access
            controls await runtime enforcement.
          </p>
        </div>
        <Users />
      </div>
      {error && (
        <div className="notice" role="alert">
          <AlertTriangle />
          {error}
        </div>
      )}
      {message && (
        <div className="notice" role="status">
          <Check />
          {message}
        </div>
      )}
      {loading ? (
        <div className={styles.loading}>
          <span role="status">Loading users…</span>
        </div>
      ) : (
        <section className="panel">
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>User</th>
                  <th>Plan</th>
                  <th>Role</th>
                  <th>AI access</th>
                  <th>Extra tokens</th>
                  <th>Last sign in</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} aria-busy={workingUser === user.id}>
                    <td>
                      <strong>{user.displayName || user.email}</strong>
                      <small>{user.email}</small>
                    </td>
                    <td>
                      {plans.find((plan) => plan.id === user.plan)?.name ||
                        user.plan ||
                        "No plan"}
                    </td>
                    <td>
                      <span
                        className={styles.roleBadge}
                        data-role={user.role === "admin" ? "admin" : "user"}
                      >
                        <ShieldCheck size={14} />
                        {user.role === "admin" ? "Admin permissions" : "User"}
                      </span>
                    </td>
                    <td>
                      <CallChip label="Not enforced" tone="bad" />
                    </td>
                    <td>—</td>
                    <td>
                      {user.lastSignInAt
                        ? new Date(user.lastSignInAt).toLocaleString()
                        : "Never"}
                    </td>
                    <td>
                      <BranchedMenu
                        label={`Manage ${user.email}`}
                        actions={[
                          {
                            label:
                              user.role === "admin"
                                ? "Remove admin"
                                : "Make admin",
                            danger: user.role === "admin",
                            onSelect: () =>
                              void action({
                                action: "role",
                                userId: user.id,
                                admin: user.role !== "admin",
                              }),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AppShell>
  );
}

type Promotion = {
  id: string;
  code: string;
  active: boolean;
  timesRedeemed: number;
  maxRedemptions: number | null;
  expiresAt: number | null;
  coupon: {
    name?: string | null;
    percent_off?: number | null;
    amount_off?: number | null;
  };
};
export function AdminCoupons() {
  const [coupons, setCoupons] = useState<Promotion[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/coupons", { cache: "no-store" });
    const result = await response.json();
    if (response.ok) setCoupons(result.coupons);
    else setError(result.message);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setSaving(true);
    setError("");
    const values = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/coupons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: values.get("code"),
        name: values.get("name"),
        kind: values.get("kind"),
        value: Number(values.get("value")),
        duration: values.get("duration"),
        durationMonths: values.get("durationMonths")
          ? Number(values.get("durationMonths"))
          : undefined,
        maxRedemptions: values.get("maxRedemptions")
          ? Number(values.get("maxRedemptions"))
          : undefined,
      }),
    });
    const result = await response.json();
    if (!response.ok) setError(result.message);
    else {
      form.reset();
      void load();
    }
    setSaving(false);
  }
  async function deactivate(id: string) {
    const response = await fetch("/api/admin/coupons", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (response.ok) void load();
    else setError((await response.json()).message);
  }
  return (
    <AppShell title="Coupon codes" eyebrow="Stripe promotions">
      <div className={styles.couponGrid}>
        <form className="panel form-panel" onSubmit={create}>
          <TicketPercent />
          <h2>Create a usable coupon</h2>
          <label>
            Customer code
            <input
              name="code"
              placeholder="RUNLY20"
              required
              pattern="[A-Za-z0-9]{3,32}"
            />
          </label>
          <label>
            Internal name
            <input name="name" placeholder="Launch discount" required />
          </label>
          <div className={styles.formPair}>
            <label>
              Discount type
              <select name="kind">
                <option value="percent">Percent off</option>
                <option value="amount">USD amount off</option>
              </select>
            </label>
            <label>
              Value
              <input
                name="value"
                type="number"
                min="0.01"
                step="0.01"
                required
              />
            </label>
          </div>
          <div className={styles.formPair}>
            <label>
              Duration
              <select name="duration">
                <option value="once">Once</option>
                <option value="forever">Forever</option>
                <option value="repeating">Repeating</option>
              </select>
            </label>
            <label>
              Months
              <input name="durationMonths" type="number" min="1" max="36" />
            </label>
          </div>
          <label>
            Maximum redemptions
            <input name="maxRedemptions" type="number" min="1" />
          </label>
          <button className="button button-dark" disabled={saving}>
            {saving ? "Creating…" : "Create coupon"}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
        <section className="panel">
          <h2>Promotion codes</h2>
          {coupons.length ? (
            coupons.map((promotion) => (
              <article className={styles.coupon} key={promotion.id}>
                <div>
                  <strong>{promotion.code}</strong>
                  <span>
                    {promotion.coupon.name ||
                      (promotion.coupon.percent_off
                        ? `${promotion.coupon.percent_off}% off`
                        : money((promotion.coupon.amount_off || 0) * 10_000))}
                  </span>
                  <small>
                    {promotion.timesRedeemed} redeemed
                    {promotion.maxRedemptions
                      ? ` of ${promotion.maxRedemptions}`
                      : ""}
                  </small>
                </div>
                <button
                  className="button button-outline"
                  disabled={!promotion.active}
                  onClick={() => void deactivate(promotion.id)}
                >
                  {promotion.active ? "Deactivate" : "Inactive"}
                </button>
              </article>
            ))
          ) : (
            <div className="empty-state compact">
              <ShieldCheck />
              <h3>No promotion codes</h3>
              <p>Create the first customer-ready code.</p>
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
