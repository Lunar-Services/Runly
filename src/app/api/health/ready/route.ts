import { adminClient } from "@/lib/api";

export async function GET() {
  try {
    const { error } = await adminClient()
      .from("subscription_plans")
      .select("id")
      .limit(1);
    if (error) throw new Error("Database unavailable");
    return Response.json(
      { status: "ready", database: "connected" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "not_ready", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
