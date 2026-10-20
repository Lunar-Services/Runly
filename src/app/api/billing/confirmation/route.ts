import { adminClient, ApiError, failure, rateLimit, session } from "@/lib/api";
import { getStripe, StripeConfigurationError } from "@/lib/stripe";
import type { PaymentConfirmation } from "@/lib/payment-confirmation";

export async function GET(request: Request) {
  try {
    const { user } = await session();
    await rateLimit(request, "billing-confirmation", user.id, 30);
    const id = new URL(request.url).searchParams.get("session_id") || "";
    if (!/^cs_[a-zA-Z0-9_]{8,240}$/.test(id))
      throw new ApiError(
        400,
        "Open the confirmation link provided after checkout.",
      );

    const db = adminClient();
    const { data: attempt, error } = await db
      .from("billing_attempts")
      .select("plan_id,stripe_customer_id")
      .eq("stripe_checkout_session_id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error)
      throw new ApiError(
        503,
        "Payment confirmation is temporarily unavailable.",
      );
    if (!attempt?.stripe_customer_id)
      throw new ApiError(
        404,
        "This checkout could not be found for your account.",
      );

    const stripe = getStripe();
    const checkout = await stripe.checkout.sessions.retrieve(
      id,
      {},
      { timeout: 15000, maxNetworkRetries: 1 },
    );
    const customerId =
      typeof checkout.customer === "string"
        ? checkout.customer
        : checkout.customer?.id;
    if (
      checkout.mode !== "subscription" ||
      checkout.client_reference_id !== user.id ||
      customerId !== attempt.stripe_customer_id
    )
      throw new ApiError(
        404,
        "This checkout could not be found for your account.",
      );

    let result: PaymentConfirmation;
    if (checkout.status === "expired") result = { status: "expired" };
    else if (
      checkout.status !== "complete" ||
      !["paid", "no_payment_required"].includes(checkout.payment_status)
    )
      result = { status: "pending" };
    else {
      const [{ data: plan }, items] = await Promise.all([
        db
          .from("subscription_plans")
          .select("name")
          .eq("id", attempt.plan_id)
          .maybeSingle(),
        stripe.checkout.sessions.listLineItems(
          id,
          { limit: 1 },
          { timeout: 15000, maxNetworkRetries: 1 },
        ),
      ]);
      const item = items.data[0];
      result = {
        status: "complete",
        plan: plan?.name || item?.description || "Runly",
        interval: item?.price?.recurring?.interval || null,
        intervalCount: item?.price?.recurring?.interval_count || 1,
        amount: checkout.amount_total,
        currency: checkout.currency || "usd",
        email:
          checkout.customer_details?.email || checkout.customer_email || null,
      };
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof StripeConfigurationError)
      return failure(
        new ApiError(
          503,
          "Payment confirmation is temporarily unavailable. You can review your payments in billing.",
        ),
      );
    return failure(error);
  }
}
