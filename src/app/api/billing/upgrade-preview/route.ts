import { z } from "zod";
import { body, failure, sameOrigin, session } from "@/lib/api";
import { adminClient } from "@/lib/api";
import { getMonthlyPrice, getStripe } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await session();
    const parsed = z
      .object({ plan: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/) })
      .safeParse(await body(request, 1024));
    if (!parsed.success) throw new Error("Invalid plan.");
    const db = adminClient();
    const [{ data: local }, { data: plan }] = await Promise.all([
      db
        .from("subscriptions")
        .select("stripe_subscription_id")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("subscription_plans")
        .select("stripe_product_id,stripe_price_id")
        .eq("id", parsed.data.plan)
        .eq("active", true)
        .maybeSingle(),
    ]);
    if (!local || !plan?.stripe_product_id)
      throw new Error("Subscription unavailable.");
    const [subscription, price] = await Promise.all([
      getStripe().subscriptions.retrieve(local.stripe_subscription_id),
      getMonthlyPrice(plan.stripe_product_id, plan.stripe_price_id),
    ]);
    const item = subscription.items.data[0];
    if (!item) throw new Error("Subscription unavailable.");
    const currentAmount = item.price.unit_amount ?? 0;
    const targetAmount = price.unit_amount ?? 0;
    if (targetAmount <= currentAmount)
      return Response.json({ kind: "downgrade" });
    const customer =
      typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id;
    const preview = await getStripe().invoices.createPreview({
      customer,
      subscription: subscription.id,
      subscription_details: {
        items: [{ id: item.id, price: price.id, quantity: item.quantity ?? 1 }],
        proration_behavior: "always_invoice",
      },
    });
    return Response.json({
      kind: "upgrade",
      amount: preview.amount_due,
      currency: preview.currency,
    });
  } catch (error) {
    return failure(error);
  }
}
