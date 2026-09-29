import { z } from "zod";
import { adminClient, adminSession, ApiError, failure } from "@/lib/api";

const filtersSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  user: z.string().uuid().optional(),
  project: z.string().uuid().optional(),
  plan: z.string().max(64).optional(),
});

export async function GET(request: Request) {
  try {
    await adminSession();
    const url = new URL(request.url);
    const parsed = filtersSchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success)
      throw new ApiError(400, "Choose valid monitoring filters.");
    const from =
      parsed.data.from || new Date(Date.now() - 30 * 86400000).toISOString();
    const to = parsed.data.to || new Date().toISOString();
    const db = adminClient();
    let logQuery = db
      .from("ai_request_logs")
      .select("*")
      .gte("created_at", from)
      .lte("created_at", to)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (parsed.data.user) logQuery = logQuery.eq("user_id", parsed.data.user);
    if (parsed.data.project)
      logQuery = logQuery.eq("project_id", parsed.data.project);
    const [
      logsResult,
      runtimesResult,
      jobsResult,
      entitlementsResult,
      plansResult,
      projectsResult,
      controlsResult,
      usersResult,
    ] = await Promise.all([
      logQuery,
      db
        .from("project_runtimes")
        .select(
          "project_id,state,session_id,last_active_at,sandbox_started_at,cpu_percent,ram_mb,error",
        ),
      db
        .from("runtime_jobs")
        .select("id,project_id,actor_id,state,error,created_at,finished_at")
        .eq("kind", "agent")
        .in("state", ["queued", "running"]),
      db
        .from("plan_entitlements")
        .select("user_id,plan_id,active,starts_at,ends_at")
        .eq("active", true),
      db
        .from("subscription_plans")
        .select("id,name,price_cents,window_3h_tokens,window_7d_tokens"),
      db.from("projects").select("id,name,owner_id").limit(2000),
      db
        .from("ai_user_controls")
        .select(
          "user_id,suspended,limit_reset_at,extra_tokens,suspension_reason",
        ),
      db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    const databaseError = [
      logsResult,
      runtimesResult,
      jobsResult,
      entitlementsResult,
      plansResult,
      projectsResult,
      controlsResult,
    ].find((result) => result.error)?.error;
    if (databaseError)
      throw new ApiError(
        503,
        "Apply the AI monitoring migration, then reload this page.",
      );

    const users = usersResult.data?.users || [];
    const userMap = new Map(
      users.map((user) => [user.id, user.email || "Unknown user"]),
    );
    const plans = plansResult.data || [];
    const planMap = new Map(plans.map((plan) => [plan.id, plan]));
    const entitlementMap = new Map(
      (entitlementsResult.data || [])
        .filter((item) => item.user_id)
        .map((item) => [item.user_id as string, item]),
    );
    const projectMap = new Map(
      (projectsResult.data || []).map((project) => [project.id, project]),
    );
    const controlMap = new Map(
      (controlsResult.data || []).map((control) => [control.user_id, control]),
    );
    let logs = logsResult.data || [];
    if (parsed.data.plan)
      logs = logs.filter(
        (log) => entitlementMap.get(log.user_id)?.plan_id === parsed.data.plan,
      );

    const byUser = new Map<
      string,
      {
        ai: number;
        sandbox: number;
        input: number;
        output: number;
        requests: number;
      }
    >();
    const byDay = new Map<
      string,
      { requests: number; tokens: number; cost: number; errors: number }
    >();
    for (const log of logs) {
      const user = byUser.get(log.user_id) || {
        ai: 0,
        sandbox: 0,
        input: 0,
        output: 0,
        requests: 0,
      };
      user.ai += Number(log.ai_cost_micros || 0);
      user.sandbox += Number(log.sandbox_cost_micros || 0);
      user.input += Number(log.input_tokens || 0);
      user.output += Number(log.output_tokens || 0);
      user.requests += 1;
      byUser.set(log.user_id, user);
      const dayKey = log.created_at.slice(0, 10);
      const day = byDay.get(dayKey) || {
        requests: 0,
        tokens: 0,
        cost: 0,
        errors: 0,
      };
      day.requests += 1;
      day.tokens += Number(log.total_tokens || 0);
      day.cost +=
        Number(log.ai_cost_micros || 0) + Number(log.sandbox_cost_micros || 0);
      if (!log.success) day.errors += 1;
      byDay.set(dayKey, day);
    }

    const costAbuse = [...byUser]
      .map(([userId, usage]) => {
        const entitlement = entitlementMap.get(userId);
        const plan = entitlement ? planMap.get(entitlement.plan_id) : undefined;
        const control = controlMap.get(userId);
        const totalCostMicros = usage.ai + usage.sandbox;
        const planPriceMicros = Number(plan?.price_cents || 0) * 10_000;
        const totalTokens = usage.input + usage.output;
        const limit =
          Number(plan?.window_7d_tokens || 0) +
          Number(control?.extra_tokens || 0);
        return {
          userId,
          email: userMap.get(userId) || "Unknown user",
          plan: plan?.name || entitlement?.plan_id || "No active plan",
          planId: entitlement?.plan_id || null,
          planPriceMicros,
          aiCostMicros: usage.ai,
          sandboxCostMicros: usage.sandbox,
          totalCostMicros,
          profitMicros: planPriceMicros - totalCostMicros,
          inputTokens: usage.input,
          outputTokens: usage.output,
          totalTokens,
          limitTokens: limit,
          limitUsagePercent: limit ? (totalTokens / limit) * 100 : 0,
          extraTokens: Number(control?.extra_tokens || 0),
          suspended: !!control?.suspended,
          overSubscriptionCost: totalCostMicros > planPriceMicros,
        };
      })
      .sort((a, b) => b.totalCostMicros - a.totalCostMicros);

    const activeUsers = new Set(logs.map((log) => log.user_id)).size;
    const totalAi = logs.reduce(
      (sum, log) => sum + Number(log.ai_cost_micros || 0),
      0,
    );
    const totalSandbox = logs.reduce(
      (sum, log) => sum + Number(log.sandbox_cost_micros || 0),
      0,
    );
    const successes = logs.filter((log) => log.success).length;
    const sandboxes = (runtimesResult.data || []).map((runtime) => ({
      ...runtime,
      projectName:
        projectMap.get(runtime.project_id)?.name || "Unknown project",
      status:
        runtime.state === "error"
          ? "crashed"
          : runtime.session_id &&
              Date.now() - Date.parse(runtime.last_active_at) < 5 * 60000
            ? "active"
            : runtime.session_id
              ? "sleeping"
              : "stopped",
      runtimeMs: runtime.sandbox_started_at
        ? Math.max(0, Date.now() - Date.parse(runtime.sandbox_started_at))
        : 0,
    }));
    const dailyRevenueMicros = [...entitlementMap.values()].reduce(
      (sum, entitlement) =>
        sum +
        (Number(planMap.get(entitlement.plan_id)?.price_cents || 0) * 10_000) /
          30,
      0,
    );
    const series = [...byDay]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, day]) => ({
        ...day,
        date,
        profitMicros: Math.round(dailyRevenueMicros - day.cost),
      }));

    return Response.json(
      {
        summary: {
          requests: logs.length,
          activeSessions: sandboxes.filter((item) => item.status === "active")
            .length,
          inputTokens: logs.reduce(
            (sum, log) => sum + Number(log.input_tokens || 0),
            0,
          ),
          outputTokens: logs.reduce(
            (sum, log) => sum + Number(log.output_tokens || 0),
            0,
          ),
          totalTokens: logs.reduce(
            (sum, log) => sum + Number(log.total_tokens || 0),
            0,
          ),
          aiCostMicros: totalAi,
          sandboxCostMicros: totalSandbox,
          costPerUserMicros: activeUsers
            ? Math.round((totalAi + totalSandbox) / activeUsers)
            : 0,
          averageLatencyMs: logs.length
            ? Math.round(
                logs.reduce(
                  (sum, log) => sum + Number(log.latency_ms || 0),
                  0,
                ) / logs.length,
              )
            : 0,
          successRate: logs.length ? (successes / logs.length) * 100 : 0,
          failureRate: logs.length
            ? ((logs.length - successes) / logs.length) * 100
            : 0,
          rateLimitErrors: logs.filter((log) => log.rate_limited).length,
          toolCalls: logs.reduce(
            (sum, log) => sum + Number(log.tool_calls || 0),
            0,
          ),
          filesEdited: logs.reduce(
            (sum, log) => sum + Number(log.files_edited || 0),
            0,
          ),
          commandsRun: logs.reduce(
            (sum, log) => sum + Number(log.commands_run || 0),
            0,
          ),
          agentRetries: logs.reduce(
            (sum, log) => sum + Number(log.agent_retries || 0),
            0,
          ),
          overSubscriptionUsers: costAbuse.filter(
            (row) => row.overSubscriptionCost,
          ).length,
        },
        series,
        costAbuse,
        requests: logs
          .slice(0, 250)
          .map((log) => ({
            ...log,
            email: userMap.get(log.user_id) || "Unknown user",
            projectName:
              projectMap.get(log.project_id)?.name || "Unknown project",
          })),
        sandboxes,
        activeJobs: jobsResult.data || [],
        filters: {
          users: users.map((user) => ({
            id: user.id,
            email: user.email || "Unknown user",
          })),
          projects: projectsResult.data || [],
          plans,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
