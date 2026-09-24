import type Stripe from "stripe";
import { getStripe, StripeConfigurationError } from "@/lib/stripe";
import {
  claimWebhook,
  completeWebhook,
  releaseWebhook,
  syncCheckoutAttempt,
  syncStripeInvoice,
  syncStripeSubscription,
  syncStripeSubscriptionById,
} from "@/lib/billing";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret)
    return new Response("Webhook configuration is missing.", { status: 400 });
  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return new Response("Invalid webhook signature.", { status: 400 });
  }
  let claimed = false;
  try {
    const claim = await claimWebhook(event, payload);
    if (claim === "completed") return Response.json({ received: true });
    // A concurrent request is already processing this event. Ask Stripe to
    // retry instead of acknowledging work that has not been committed.
    if (claim === "processing")
      return new Response("Webhook is already processing.", { status: 500 });
    claimed = true;
    if (event.type.startsWith("customer.subscription.")) {
      const eventSubscription = event.data.object as Stripe.Subscription;
      // The signed event is the authority for *when* to sync. Retrieve the
      // subscription server-side so the persisted record always uses Stripe's
      // complete current item billing period, including after API upgrades.
      const subscription = await getStripe().subscriptions.retrieve(
        eventSubscription.id,
      );
      await syncStripeSubscription(subscription, event.created);
    }
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const checkout = event.data.object as Stripe.Checkout.Session;
      const subscriptionId =
        typeof checkout.subscription === "string"
          ? checkout.subscription
          : checkout.subscription?.id;
      if (subscriptionId)
        await syncStripeSubscriptionById(subscriptionId, event.created);
      await syncCheckoutAttempt(checkout, event.created);
    }
    if (
      event.type === "invoice.paid" ||
      event.type === "invoice.payment_failed"
    ) {
      await syncStripeInvoice(
        event.data.object as Stripe.Invoice,
        event.created,
      );
    }
    await completeWebhook(event.id);
    return Response.json({ received: true });
  } catch (error) {
    if (claimed) await releaseWebhook(event.id);
    if (error instanceof StripeConfigurationError)
      return new Response("Webhook configuration is missing.", { status: 500 });
    return new Response("Webhook processing failed.", { status: 500 });
  }
}
