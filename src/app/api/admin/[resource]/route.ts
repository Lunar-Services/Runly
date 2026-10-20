import { z } from "zod";
import {
  adminClient,
  adminSession,
  ApiError,
  body,
  failure,
  rateLimit,
  sameOrigin,
} from "@/lib/api";
import {
  adminInvoices,
  adminReports,
  encryptAdminToken,
  nestInput,
  nestRecord,
  preferencesInput,
  swiftletInput,
  swiftletSettings,
} from "@/lib/admin-server";

type Context = { params: Promise<{ resource: string }> };
const reply = (data: unknown) =>
  Response.json(data, { headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request, context: Context) {
  try {
    const { user } = await adminSession();
    await rateLimit(request, "admin-read", user.id, 120);
    const { resource } = await context.params;
    const db = adminClient();
    if (resource === "swiftlet") {
      const { data, error } = await db
        .from("swiftlet_settings")
        .select("*")
        .eq("id", true)
        .maybeSingle();
      if (error) throw new ApiError(502, "Couldn't load Swiftlet settings.");
      return reply(swiftletSettings(data));
    }
    if (resource === "nests") {
      const { data, error } = await db
        .from("nests")
        .select(
          "id,name,endpoint,country_code,max_eggs,status,active_eggs,cpu_percent,ram_percent",
        )
        .order("name")
        .limit(1000);
      if (error) throw new ApiError(502, "Couldn't load Nests.");
      return reply({
        nests: (data || []).map(nestRecord),
        sandboxAvailable: false,
      });
    }
    if (resource === "settings") {
      const { data, error } = await db
        .from("admin_preferences")
        .select("default_range")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error)
        throw new ApiError(502, "Couldn't load dashboard preferences.");
      return reply({ defaultRange: data?.default_range || 30 });
    }
    if (resource === "billing") return reply(await adminInvoices());
    if (
      !["overview", "users", "projects", "usage", "activity"].includes(resource)
    )
      throw new ApiError(404, "Unknown admin resource.");
    const range = Number(new URL(request.url).searchParams.get("days") || 30);
    if (![7, 30, 90].includes(range))
      throw new ApiError(400, "Choose a 7, 30 or 90 day range.");
    const report = await adminReports(range);
    return reply(
      resource === "overview"
        ? report
        : {
            [resource]:
              report[resource as "users" | "projects" | "usage" | "activity"],
            limit: report.limit,
            truncated: report.truncated,
          },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const { user } = await adminSession();
    await rateLimit(request, "admin-write", user.id, 30);
    const { resource } = await context.params;
    const db = adminClient();
    const value = await body(request, 12000);
    if (resource === "swiftlet") {
      const parsed = swiftletInput.parse(value);
      const row = {
        id: true,
        endpoint: parsed.endpoint,
        scheduling: parsed.scheduling,
        max_eggs: parsed.maxEggs,
        idle_minutes: parsed.idleMinutes,
        heartbeat_seconds: parsed.heartbeatSeconds,
        provisioning_seconds: parsed.provisioningSeconds,
        updated_by: user.id,
        ...(parsed.apiToken === undefined
          ? {}
          : {
              encrypted_api_token:
                parsed.apiToken === null
                  ? null
                  : encryptAdminToken(parsed.apiToken),
              token_set_at:
                parsed.apiToken === null ? null : new Date().toISOString(),
            }),
      };
      const { data, error } = await db
        .from("swiftlet_settings")
        .update(row)
        .eq("id", true)
        .select("*")
        .single();
      if (error) throw new ApiError(502, "Couldn't save Swiftlet settings.");
      return reply(swiftletSettings(data));
    }
    if (resource === "settings") {
      const parsed = preferencesInput.parse(value);
      const { error } = await db
        .from("admin_preferences")
        .upsert({ user_id: user.id, default_range: parsed.defaultRange });
      if (error)
        throw new ApiError(502, "Couldn't save dashboard preferences.");
      return reply(parsed);
    }
    if (resource === "nests") {
      const parsed = nestInput.required({ id: true }).parse(value);
      const { data, error } = await db
        .from("nests")
        .update({
          name: parsed.name,
          endpoint: parsed.endpoint,
          country_code: parsed.countryCode,
          max_eggs: parsed.maxEggs,
          ...(parsed.status === undefined ? {} : { status: parsed.status }),
          updated_by: user.id,
        })
        .eq("id", parsed.id)
        .select(
          "id,name,endpoint,country_code,max_eggs,status,active_eggs,cpu_percent,ram_percent",
        )
        .maybeSingle();
      if (error?.code === "23505")
        throw new ApiError(409, "A Nest with that name or URL already exists.");
      if (error) throw new ApiError(502, "Couldn't update the Nest.");
      if (!data) throw new ApiError(404, "Nest not found.");
      return reply({ nest: nestRecord(data) });
    }
    throw new ApiError(404, "Unknown admin resource.");
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const { user } = await adminSession();
    await rateLimit(request, "admin-write", user.id, 30);
    const { resource } = await context.params;
    if (resource === "export") {
      const input = z
        .object({
          resource: z.enum([
            "overview",
            "users",
            "projects",
            "usage",
            "billing",
            "activity",
          ]),
          days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
          rowCount: z.number().int().min(0).max(1000),
        })
        .strict()
        .parse(await body(request, 1000));
      const { error } = await adminClient()
        .from("audit_events")
        .insert({
          actor_id: user.id,
          action: "admin.report_exported",
          metadata: { ...input, rowCountSource: "client_filtered_report" },
        });
      if (error)
        throw new ApiError(
          502,
          "Couldn't record the report export. Please retry.",
        );
      return reply({ message: "Report export recorded." });
    }
    if (resource !== "nests")
      throw new ApiError(404, "Unknown admin resource.");
    const parsed = nestInput.parse(await body(request, 6000));
    const { data, error } = await adminClient()
      .from("nests")
      .insert({
        name: parsed.name,
        endpoint: parsed.endpoint,
        country_code: parsed.countryCode,
        max_eggs: parsed.maxEggs,
        status: parsed.status || "pending",
        created_by: user.id,
        updated_by: user.id,
      })
      .select(
        "id,name,endpoint,country_code,max_eggs,status,active_eggs,cpu_percent,ram_percent",
      )
      .single();
    if (error?.code === "23505")
      throw new ApiError(409, "A Nest with that name or URL already exists.");
    if (error) throw new ApiError(502, "Couldn't add the Nest.");
    return reply({ nest: nestRecord(data) });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const { user } = await adminSession();
    await rateLimit(request, "admin-write", user.id, 30);
    if ((await context.params).resource !== "nests")
      throw new ApiError(404, "Unknown admin resource.");
    const { id } = z
      .object({ id: z.uuid() })
      .strict()
      .parse(await body(request, 1000));
    // Use the database operation so the active-Egg check, removal and audit event
    // are a single transaction rather than a race between independent requests.
    const { error } = await adminClient().rpc("remove_admin_nest", {
      p_actor: user.id,
      p_nest: id,
    });
    if (error?.message.includes("nest_busy"))
      throw new ApiError(409, "Drain active Eggs before removing this Nest.");
    if (error?.message.includes("nest_missing"))
      throw new ApiError(404, "Nest not found.");
    if (error) throw new ApiError(502, "Couldn't remove the Nest.");
    return reply({ message: "Nest removed." });
  } catch (error) {
    return failure(error);
  }
}
