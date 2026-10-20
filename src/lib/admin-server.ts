import "server-only";
import { createCipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
import { adminClient, ApiError } from "./api";
import { getCountry } from "./countries";
import { getStripe } from "./stripe";

const baseUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  }, "Use an HTTP or HTTPS base URL without credentials, queries or fragments.")
  .transform((value) => value.replace(/\/+$/, ""));
export const swiftletInput = z
  .object({
    endpoint: z.union([z.literal(""), baseUrl]),
    scheduling: z.enum(["least-occupied", "round-robin", "available-memory"]),
    maxEggs: z.number().int().min(1).max(500),
    idleMinutes: z.number().int().min(1).max(1440),
    heartbeatSeconds: z.number().int().min(10).max(600),
    provisioningSeconds: z.number().int().min(30).max(3600),
    apiToken: z.string().min(1).max(4096).nullable().optional(),
  })
  .strict();
export const nestInput = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(80),
    endpoint: baseUrl,
    countryCode: z
      .string()
      .refine((value) => value === "" || Boolean(getCountry(value))),
    maxEggs: z.number().int().min(1).max(500),
    status: z.enum(["pending", "offline", "draining"]).optional(),
  })
  .strict();
export const preferencesInput = z
  .object({
    defaultRange: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  })
  .strict();

export function encryptAdminToken(token: string) {
  const raw = process.env.RUNLY_CREDENTIAL_ENCRYPTION_KEY || "";
  if (!/^[a-f\d]{64}$/i.test(raw))
    throw new ApiError(
      503,
      "Configure the server credential encryption key before saving an API token.",
    );
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(raw, "hex"), iv);
  cipher.setAAD(Buffer.from("runly:swiftlet:api-token:v1"));
  const encrypted = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function swiftletSettings(row: Record<string, unknown> | null) {
  return {
    settings: {
      endpoint: String(row?.endpoint || ""),
      scheduling: String(row?.scheduling || "least-occupied"),
      maxEggs: Number(row?.max_eggs || 8),
      idleMinutes: Number(row?.idle_minutes || 30),
      heartbeatSeconds: Number(row?.heartbeat_seconds || 90),
      provisioningSeconds: Number(row?.provisioning_seconds || 180),
    },
    tokenConfigured: Boolean(row?.encrypted_api_token),
    sandboxAvailable: false,
  };
}
export function nestRecord(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    endpoint: row.endpoint,
    countryCode: row.country_code,
    maxEggs: row.max_eggs,
    status: row.status,
    activeEggs: row.active_eggs,
    cpuPercent: row.cpu_percent,
    ramPercent: row.ram_percent,
  };
}

async function checked<T>(
  query: PromiseLike<{ data: T; error: unknown }>,
  message: string,
): Promise<NonNullable<T>> {
  const { data, error } = await query;
  if (error || data === null || data === undefined)
    throw new ApiError(502, message);
  return data as NonNullable<T>;
}

export async function adminReports(days: number) {
  const db = adminClient();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const [
    profiles,
    projectRows,
    usageRows,
    entitlements,
    plans,
    eventRows,
    legacyEvents,
  ] = await Promise.all([
    checked(
      db
        .from("profiles")
        .select("id,display_name,full_name,created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      "Couldn't load users.",
    ),
    checked(
      db
        .from("projects")
        .select(
          "id,name,owner_id,status,created_at,updated_at,template_id,programming_language,project_type",
        )
        .order("updated_at", { ascending: false })
        .limit(1000),
      "Couldn't load projects.",
    ),
    checked(
      db
        .from("usage_events")
        .select("id,user_id,project_id,input_tokens,output_tokens,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      "Couldn't load usage.",
    ),
    checked(
      db
        .from("plan_entitlements")
        .select("user_id,plan_id,active,ends_at")
        .eq("active", true)
        .limit(1000),
      "Couldn't load subscriptions.",
    ),
    checked(
      db.from("subscription_plans").select("id,name").limit(1000),
      "Couldn't load plans.",
    ),
    checked(
      db
        .from("audit_events")
        .select("id,actor_id,project_id,action,metadata,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      "Couldn't load activity.",
    ),
    checked(
      db
        .from("audit_logs")
        .select("id,actor_id,action,target_type,target_id,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      "Couldn't load activity.",
    ),
  ]);
  // Auth users are only read through the server administrator API, never exposed
  // as raw auth records. Pagination prevents a hidden first-page-only directory.
  const authUsers = [];
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({
      page,
      perPage: 100,
    });
    if (error) throw new ApiError(502, "Couldn't load user accounts.");
    authUsers.push(...data.users);
    if (data.users.length < 100) break;
  }
  const profileMap = new Map(profiles.map((row) => [row.id, row]));
  const authMap = new Map(authUsers.map((user) => [user.id, user]));
  const planMap = new Map(plans.map((plan) => [plan.id, plan.name]));
  const userName = (id: string | null) => {
    const profile = id ? profileMap.get(id) : null;
    return (
      profile?.display_name ||
      profile?.full_name ||
      (id ? authMap.get(id)?.email : null) ||
      "System"
    );
  };
  const projectMap = new Map(
    projectRows.map((project) => [project.id, project]),
  );
  const users = authUsers.map((user) => ({
    id: user.id,
    name: userName(user.id),
    email: user.email || "",
    plan:
      planMap.get(
        entitlements.find(
          (row) =>
            row.user_id === user.id &&
            (!row.ends_at || new Date(row.ends_at) > new Date()),
        )?.plan_id || "",
      ) || "Free",
    projects: projectRows.filter(
      (project) =>
        project.owner_id === user.id && project.status !== "archived",
    ).length,
    joined: user.created_at,
    status:
      user.banned_until && new Date(user.banned_until) > new Date()
        ? "Inactive"
        : user.email_confirmed_at
          ? "Active"
          : "Unverified",
    avatarTone: "blue",
  }));
  const projects = projectRows.map((project) => ({
    id: project.id,
    name: project.name,
    owner: userName(project.owner_id),
    type:
      project.project_type === "video"
        ? "Video"
        : project.project_type === "app"
          ? "App"
          : "Website",
    updated: project.updated_at,
    created: project.created_at,
    status:
      project.status === "archived"
        ? "Archived"
        : project.status === "active"
          ? "In progress"
          : "Draft",
  }));
  const usage = usageRows.map((event) => ({
    id: event.id,
    project: projectMap.get(event.project_id)?.name || "Project",
    user: userName(event.user_id),
    type:
      projectMap.get(event.project_id)?.project_type === "video"
        ? "Video"
        : projectMap.get(event.project_id)?.project_type === "app"
          ? "App"
          : "Website",
    tokens: Number(event.input_tokens) + Number(event.output_tokens),
    date: event.created_at,
    status: "Completed",
  }));
  const activity = [
    ...eventRows.map((event) => ({
      id: event.id,
      event: event.action,
      actor: userName(event.actor_id),
      subject: event.project_id
        ? projectMap.get(event.project_id)?.name || "Project"
        : "Administration",
      date: event.created_at,
      time:
        new Date(event.created_at).toLocaleTimeString("en-GB", {
          timeZone: "UTC",
        }) + " UTC",
      category: event.action.startsWith("admin.")
        ? "Administration"
        : "Projects",
    })),
    ...legacyEvents.map((event) => ({
      id: `legacy-${event.id}`,
      event: event.action,
      actor: userName(event.actor_id),
      subject: `${event.target_type}${event.target_id ? `: ${event.target_id}` : ""}`,
      date: event.created_at,
      time:
        new Date(event.created_at).toLocaleTimeString("en-GB", {
          timeZone: "UTC",
        }) + " UTC",
      category: "Administration",
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 1000);
  const summaryData = await checked(
    db.rpc("admin_report_summary", { p_days: days }),
    "Couldn't load dashboard totals.",
  );
  const summary = z
    .object({
      users: z.number().nonnegative(),
      activeProjects: z.number().nonnegative(),
      tokensUsed: z.number().nonnegative(),
      creationActivity: z.array(
        z.object({
          date: z.string(),
          website: z.number().nonnegative(),
          video: z.number().nonnegative(),
          app: z.number().nonnegative(),
        }),
      ),
    })
    .parse(summaryData);
  return {
    users,
    projects,
    usage,
    activity,
    creationActivity: summary.creationActivity,
    overview: {
      users: summary.users,
      activeProjects: summary.activeProjects,
      tokensUsed: summary.tokensUsed,
      sandboxAvailable: false,
    },
    limit: 1000,
    truncated: [
      profiles,
      projectRows,
      usageRows,
      eventRows,
      legacyEvents,
      authUsers,
    ].some((rows) => rows.length >= 1000),
  };
}

export async function adminInvoices() {
  if (!process.env.STRIPE_SECRET_KEY)
    return { invoices: [], configured: false };
  try {
    const stripe = getStripe();
    const [invoices, customers, entitlements, plans] = await Promise.all([
      stripe.invoices.list({ limit: 100 }),
      checked(
        adminClient()
          .from("stripe_customers")
          .select("user_id,stripe_customer_id")
          .limit(1000),
        "Couldn't load customers.",
      ),
      checked(
        adminClient()
          .from("plan_entitlements")
          .select("user_id,plan_id")
          .eq("active", true)
          .limit(1000),
        "Couldn't load plans.",
      ),
      checked(
        adminClient().from("subscription_plans").select("id,name").limit(1000),
        "Couldn't load plans.",
      ),
    ]);
    return {
      configured: true,
      hasMore: invoices.has_more,
      invoices: invoices.data.map((invoice) => {
        const customerId =
          typeof invoice.customer === "string"
            ? invoice.customer
            : invoice.customer?.id;
        const owner = customers.find(
          (row) => row.stripe_customer_id === customerId,
        );
        return {
          id: invoice.id,
          user:
            invoice.customer_name ||
            invoice.customer_email ||
            owner?.user_id ||
            "Customer",
          plan:
            plans.find(
              (plan) =>
                plan.id ===
                entitlements.find((row) => row.user_id === owner?.user_id)
                  ?.plan_id,
            )?.name || "Subscription",
          amount: invoice.amount_paid / 100,
          currency: invoice.currency,
          date: new Date(invoice.created * 1000).toISOString(),
          status:
            invoice.status === "paid"
              ? "Paid"
              : invoice.status === "void"
                ? "Void"
                : "Needs attention",
        };
      }),
    };
  } catch {
    throw new ApiError(
      502,
      "Couldn't load Stripe invoices. Check the billing connection and retry.",
    );
  }
}
