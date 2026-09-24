import { adminClient, failure } from "@/lib/api";

export async function GET() {
  try {
    const { data, error } = await adminClient()
      .from("subscription_plans")
      .select("id,name,price_cents,window_3h_tokens,window_7d_tokens")
      .eq("active", true)
      .not("stripe_product_id", "is", null)
      .order("price_cents", { ascending: true });
    if (error) throw new Error("Couldn't load plans.");
    return Response.json(
      { plans: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
