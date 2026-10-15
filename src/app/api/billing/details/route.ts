import type Stripe from "stripe";
import { adminClient, ApiError, failure, rateLimit, session } from "@/lib/api";
import { getStripe, StripeConfigurationError } from "@/lib/stripe";

export async function GET(request: Request) {
  try {
    const { user } = await session();
    await rateLimit(request, "billing-details", user.id, 30);
    const db = adminClient();
    const { data: localCustomer, error: customerError } = await db
      .from("stripe_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (customerError)
      throw new ApiError(502, "Couldn't load your billing details. Try again.");
    if (!localCustomer)
      return Response.json(
        {
          customer: false,
          paymentMethod: null,
          billingDetails: null,
          subscriptionPrice: null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );

    const { data: localSubscription, error: subscriptionError } = await db
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("stripe_customer_id", localCustomer.stripe_customer_id)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscriptionError)
      throw new ApiError(
        502,
        "Couldn't load your subscription details. Try again.",
      );

    const stripe = getStripe();
    const [customer, subscription] = await Promise.all([
      stripe.customers.retrieve(localCustomer.stripe_customer_id, {
        expand: ["invoice_settings.default_payment_method", "default_source"],
      }),
      localSubscription
        ? stripe.subscriptions.retrieve(
            localSubscription.stripe_subscription_id,
            { expand: ["default_payment_method", "default_source"] },
          )
        : Promise.resolve(null),
    ]);
    if (customer.deleted)
      throw new ApiError(404, "Your billing account could not be found.");
    // Subscription defaults take precedence over the customer invoice default.
    // Return only a display summary, never a full Stripe object.
    const subscriptionSource = subscription?.default_source;
    let method: string | Stripe.PaymentMethod | null =
      subscription?.default_payment_method ||
      (!subscriptionSource
        ? customer.invoice_settings.default_payment_method
        : null);
    if (typeof method === "string")
      method = await stripe.paymentMethods.retrieve(method);
    let source = !method ? subscriptionSource || customer.default_source : null;
    if (typeof source === "string")
      source = await stripe.customers.retrieveSource(customer.id, source);
    const card = method?.card || (source?.object === "card" ? source : null);
    const paymentType =
      method?.type ||
      (source?.object === "source" ? source.type : source?.object);
    const price = subscription?.items.data[0]?.price;
    return Response.json(
      {
        customer: true,
        paymentMethod: paymentType
          ? {
              type: paymentType,
              card: card
                ? {
                    brand: card.brand,
                    last4: card.last4,
                    expMonth: card.exp_month,
                    expYear: card.exp_year,
                  }
                : null,
            }
          : null,
        billingDetails: {
          name: customer.name || "",
          email: customer.email || "",
          address: customer.address
            ? {
                line1: customer.address.line1 || "",
                line2: customer.address.line2 || "",
                city: customer.address.city || "",
                state: customer.address.state || "",
                postalCode: customer.address.postal_code || "",
                country: customer.address.country || "",
              }
            : null,
        },
        subscriptionPrice: price
          ? {
              amount: price.unit_amount,
              currency: price.currency,
              interval: price.recurring?.interval || "month",
              intervalCount: price.recurring?.interval_count || 1,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof StripeConfigurationError)
      return failure(
        new ApiError(
          503,
          "Billing details are temporarily unavailable. Please try again later.",
        ),
      );
    return failure(error);
  }
}
