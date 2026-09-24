import Stripe from "stripe";

export class StripeConfigurationError extends Error {}

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey)
    throw new StripeConfigurationError("Billing is not configured.");
  return new Stripe(secretKey);
}

export async function getMonthlyPrice(
  productId: string,
  priceId?: string | null,
) {
  const stripe = getStripe();
  if (priceId) {
    const price = await stripe.prices.retrieve(priceId);
    const priceProduct =
      typeof price.product === "string" ? price.product : price.product.id;
    if (
      !price.active ||
      priceProduct !== productId ||
      price.currency !== "usd" ||
      price.unit_amount === null ||
      price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1
    )
      throw new StripeConfigurationError(
        "The configured Stripe Price must be an active USD monthly recurring Price for this Product.",
      );
    return price;
  }
  const prices = await stripe.prices.list({
    product: productId,
    active: true,
    type: "recurring",
    limit: 100,
  });
  const monthlyPrices = prices.data.filter(
    (price) =>
      price.active &&
      price.currency === "usd" &&
      price.unit_amount !== null &&
      price.recurring?.interval === "month" &&
      price.recurring.interval_count === 1,
  );
  if (monthlyPrices.length !== 1) {
    throw new StripeConfigurationError(
      "This Product must have exactly one active USD monthly recurring Stripe Price.",
    );
  }
  return monthlyPrices[0];
}

export function subscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const periodEnd = subscription.items.data[0]?.current_period_end;
  return periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
}
