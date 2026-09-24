import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { adminClient } from "@/lib/api";
import {
  getMonthlyPrice,
  getStripe,
  subscriptionPeriodEnd,
} from "@/lib/stripe";

const accessStatuses = new Set(["active", "trialing"]);

export class BillingReconciliationUnavailableError extends Error {}
export class CheckoutPendingError extends Error {}

function timestampAfter(milliseconds: number) {
  return new Date(Date.now() + milliseconds).toISOString();
}

function retryAt(
  failures: number,
  baseMilliseconds: number,
  capMilliseconds: number,
) {
  const exponential = Math.min(
    capMilliseconds,
    baseMilliseconds * 2 ** Math.min(Math.max(failures - 1, 0), 8),
  );
  // A small jitter prevents a failed provider or restart from creating a thundering herd.
  return timestampAfter(
    exponential + Math.floor(Math.random() * exponential * 0.2),
  );
}

function nextSubscriptionReconciliation(subscription: Stripe.Subscription) {
  const status = subscription.status;
  if (["canceled", "incomplete_expired", "unpaid"].includes(status))
    return null;
  if (["incomplete", "past_due", "paused"].includes(status))
    return retryAt(1, 15 * 60_000, 6 * 60 * 60_000);
  const periodEnd = subscriptionPeriodEnd(subscription);
  if (!periodEnd) return timestampAfter(24 * 60 * 60_000);
  const periodEndMs = Date.parse(periodEnd);
  if (subscription.cancel_at_period_end)
    return new Date(
      Math.max(Date.now() + 5 * 60_000, periodEndMs + 60_000),
    ).toISOString();
  // Webhooks are the normal update path; this is one repair check shortly
  // before renewal, never a fixed interval poll of all active subscriptions.
  return new Date(
    Math.max(Date.now() + 60 * 60_000, periodEndMs - 6 * 60 * 60_000),
  ).toISOString();
}

async function stripeCustomerForUser(userId: string) {
  const { data, error } = await adminClient()
    .from("stripe_customers")
    .select("stripe_customer_id,last_reconciled_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Couldn't load billing account.");
  return data;
}

export async function getOrCreateStripeCustomer(userId: string, email: string) {
  const db = adminClient();
  const { data: existing, error: readError } = await db
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (readError) throw new Error("Couldn't load billing account.");
  if (existing) return existing.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create(
    { email, metadata: { runly_user_id: userId } },
    { idempotencyKey: `runly-customer-${userId}` },
  );
  const { error: insertError } = await db
    .from("stripe_customers")
    .insert({ user_id: userId, stripe_customer_id: customer.id });
  if (!insertError) return customer.id;
  const { data: concurrent } = await db
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (concurrent) return concurrent.stripe_customer_id;
  throw new Error("Couldn't create billing account.");
}

export async function createCheckout(
  userId: string,
  email: string,
  planId: string,
  origin: string,
) {
  const db = adminClient();
  const existingCustomer = await stripeCustomerForUser(userId);
  if (
    existingCustomer &&
    !(await reconcileStripeCustomerOnDemand(
      existingCustomer.stripe_customer_id,
    ))
  )
    throw new BillingReconciliationUnavailableError(
      "Stripe could not confirm your existing subscription.",
    );
  const { data: activeEntitlements, error } = await db
    .from("plan_entitlements")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .limit(1);
  if (error) throw new Error("Couldn't load your subscription.");
  if (activeEntitlements.length)
    throw new Error(
      "You already have an active subscription. Use the billing portal to change your plan.",
    );
  const { data: plan, error: planError } = await db
    .from("subscription_plans")
    .select("id,stripe_product_id,stripe_price_id")
    .eq("id", planId)
    .eq("active", true)
    .maybeSingle();
  if (planError || !plan?.stripe_product_id)
    throw new Error("Choose a valid subscription plan.");
  const { data: attempt, error: attemptError } = await db
    .from("billing_attempts")
    .insert({
      user_id: userId,
      plan_id: planId,
      status: "PENDING",
      next_reconcile_at: timestampAfter(60_000),
    })
    .select("id")
    .single();
  if (attemptError) {
    if (attemptError.code === "23505")
      throw new CheckoutPendingError("A checkout is already in progress.");
    throw new Error("Couldn't start checkout.");
  }
  let customerId: string;
  let price: Stripe.Price;
  try {
    [customerId, price] = await Promise.all([
      getOrCreateStripeCustomer(userId, email),
      getMonthlyPrice(plan.stripe_product_id, plan.stripe_price_id),
    ]);
  } catch (error) {
    await db
      .from("billing_attempts")
      .update({ status: "FAILED", next_reconcile_at: null })
      .eq("id", attempt.id)
      .eq("user_id", userId);
    throw error;
  }
  const { error: customerAttemptError } = await db
    .from("billing_attempts")
    .update({ stripe_customer_id: customerId })
    .eq("id", attempt.id)
    .eq("user_id", userId)
    .eq("status", "PENDING");
  if (customerAttemptError) throw new Error("Couldn't save checkout state.");
  const stripe = getStripe();
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "subscription",
        customer: customerId,
        client_reference_id: userId,
        line_items: [{ price: price.id, quantity: 1 }],
        success_url: `${origin}/settings/billing?checkout=success`,
        cancel_url: `${origin}/pricing?checkout=cancelled`,
        subscription_data: {
          metadata: {
            runly_user_id: userId,
            runly_plan: planId,
            runly_billing_attempt_id: attempt.id,
          },
        },
        metadata: { runly_billing_attempt_id: attempt.id },
      },
      { idempotencyKey: `runly-checkout-${attempt.id}` },
    );
  } catch (error) {
    await db
      .from("billing_attempts")
      .update({ status: "FAILED", next_reconcile_at: null })
      .eq("id", attempt.id)
      .eq("user_id", userId);
    throw error;
  }
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  const { error: attemptUpdateError } = await db
    .from("billing_attempts")
    .update({
      stripe_checkout_session_id: session.id,
      next_reconcile_at: timestampAfter(60_000),
    })
    .eq("id", attempt.id)
    .eq("user_id", userId);
  if (attemptUpdateError) throw new Error("Couldn't save checkout state.");
  await db
    .from("subscription_plans")
    .update({ stripe_price_id: price.id })
    .eq("id", planId);
  return session.url;
}

export async function createPortal(userId: string, origin: string) {
  const db = adminClient();
  const { data, error } = await db
    .from("stripe_customers")
    .select("stripe_customer_id,last_reconciled_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error("Couldn't load billing account.");
  if (!data) throw new Error("You don't have a billing account yet.");
  if (!(await reconcileUserBilling(userId)))
    throw new BillingReconciliationUnavailableError(
      "Stripe could not confirm your subscription.",
    );
  const session = await getStripe().billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${origin}/settings/billing`,
  });
  return session.url;
}

export async function createUpgradePortal(
  userId: string,
  origin: string,
  planId: string,
) {
  const db = adminClient();
  const [local, planResult] = await Promise.all([
    ownedStripeSubscription(userId),
    db
      .from("subscription_plans")
      .select("stripe_product_id,stripe_price_id")
      .eq("id", planId)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (planResult.error || !planResult.data?.stripe_product_id)
    throw new Error("Choose an available plan.");
  const targetPrice = await getMonthlyPrice(
    planResult.data.stripe_product_id,
    planResult.data.stripe_price_id,
  );
  const subscription = await getStripe().subscriptions.retrieve(
    local.stripe_subscription_id,
  );
  const item = subscription.items.data[0];
  if (!item) throw new Error("This subscription cannot be upgraded.");
  const customer = await stripeCustomerForUser(userId);
  if (!customer) throw new Error("No billing account was found.");
  const session = await getStripe().billingPortal.sessions.create({
    customer: customer.stripe_customer_id,
    return_url: `${origin}/settings/billing`,
    flow_data: {
      type: "subscription_update_confirm",
      after_completion: {
        type: "redirect",
        redirect: { return_url: `${origin}/settings/billing` },
      },
      subscription_update_confirm: {
        subscription: subscription.id,
        items: [
          { id: item.id, price: targetPrice.id, quantity: item.quantity ?? 1 },
        ],
      },
    },
  });
  return session.url;
}

async function ownedStripeSubscription(userId: string) {
  const { data, error } = await adminClient()
    .from("subscriptions")
    .select("stripe_subscription_id,stripe_price_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) throw new Error("No subscription was found.");
  return data;
}

export async function cancelAtPeriodEnd(userId: string) {
  const local = await ownedStripeSubscription(userId);
  const subscription = await getStripe().subscriptions.update(
    local.stripe_subscription_id,
    { cancel_at_period_end: true },
    { idempotencyKey: `runly-cancel-${local.stripe_subscription_id}` },
  );
  await syncStripeSubscription(subscription, Math.floor(Date.now() / 1000));
}

async function invoiceHistory(stripeCustomerId: string | null) {
  if (!stripeCustomerId) return { invoices: [], invoicesAvailable: false };
  try {
    const { data } = await getStripe().invoices.list({
      customer: stripeCustomerId,
      limit: 12,
    });
    return {
      invoices: data.map((invoice) => ({
        id: invoice.id,
        created: new Date(invoice.created * 1000).toISOString(),
        status: invoice.status || "open",
        amount: invoice.amount_due,
        currency: invoice.currency,
        url: invoice.hosted_invoice_url || invoice.invoice_pdf,
      })),
      invoicesAvailable: true,
    };
  } catch {
    // Billing state remains available from verified webhook records when the
    // Stripe API is intentionally disabled during ordinary local development.
    return { invoices: [], invoicesAvailable: false };
  }
}

// Protected server features use this to avoid granting subscription access
// from a record that could have become stale while webhook delivery was down.
async function reconcileStripeCustomerOnDemand(stripeCustomerId: string) {
  try {
    const { data } = await getStripe().subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 100,
    });
    for (const subscription of data) {
      const synced = await syncStripeSubscription(
        subscription,
        Math.floor(Date.now() / 1000),
      );
      if (!synced)
        throw new Error("Subscription no longer has a valid billing mapping.");
    }
    return true;
  } catch {
    // This is an explicit user action or account-view repair, not a scheduled
    // poll. If Checkout cannot verify Stripe, it must fail closed.
    return false;
  }
}

export async function reconcileUserBilling(userId: string) {
  const { data: subscription, error } = await adminClient()
    .from("subscriptions")
    .select("stripe_subscription_id,next_reconcile_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("Couldn't load subscription state.");
  if (!subscription || !subscription.next_reconcile_at) return true;
  if (Date.parse(subscription.next_reconcile_at) > Date.now()) return true;
  try {
    return await syncStripeSubscriptionById(
      subscription.stripe_subscription_id,
      Math.floor(Date.now() / 1000),
    );
  } catch {
    return false;
  }
}

export async function syncCheckoutAttempt(
  checkout: Stripe.Checkout.Session,
  eventCreated: number,
) {
  const attemptId = checkout.metadata?.runly_billing_attempt_id;
  if (!attemptId) return;
  const db = adminClient();
  const { data: attempt, error } = await db
    .from("billing_attempts")
    .select("id,user_id,stripe_customer_id,reconcile_failures")
    .eq("id", attemptId)
    .maybeSingle();
  if (error || !attempt) return;
  const customerId =
    typeof checkout.customer === "string"
      ? checkout.customer
      : checkout.customer?.id;
  if (attempt.stripe_customer_id && customerId !== attempt.stripe_customer_id)
    return;
  const subscriptionId =
    typeof checkout.subscription === "string"
      ? checkout.subscription
      : checkout.subscription?.id;
  if (subscriptionId)
    await syncStripeSubscriptionById(subscriptionId, eventCreated);
  const completed = checkout.status === "complete";
  const expired = checkout.status === "expired";
  await db
    .from("billing_attempts")
    .update({
      stripe_checkout_session_id: checkout.id,
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: subscriptionId ?? null,
      status: completed ? "COMPLETED" : expired ? "EXPIRED" : "PENDING",
      completed_at: completed ? new Date().toISOString() : null,
      next_reconcile_at:
        completed || expired
          ? null
          : retryAt(attempt.reconcile_failures, 60_000, 6 * 60 * 60_000),
      reconcile_failures: completed || expired ? 0 : attempt.reconcile_failures,
      reconciliation_locked_until: null,
    })
    .eq("id", attempt.id)
    .eq("user_id", attempt.user_id);
}

export async function syncStripeInvoice(
  invoice: Stripe.Invoice,
  eventCreated: number,
  syncSubscription = true,
) {
  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : invoice.customer?.id;
  const subscription = invoice.parent?.subscription_details?.subscription;
  const subscriptionId =
    typeof subscription === "string" ? subscription : subscription?.id;
  if (!customerId) return;
  const db = adminClient();
  const { data: customer, error } = await db
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error || !customer) return;
  const paid = invoice.status === "paid";
  const { error: invoiceError } = await db.from("stripe_invoices").upsert(
    {
      stripe_invoice_id: invoice.id,
      user_id: customer.user_id,
      stripe_subscription_id: subscriptionId ?? null,
      status: invoice.status ?? "open",
      paid_at:
        invoice.status_transitions.paid_at && paid
          ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
          : null,
      period_end: invoice.period_end
        ? new Date(invoice.period_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_invoice_id" },
  );
  if (invoiceError) throw new Error("Couldn't save invoice state.");
  if (paid && subscriptionId) {
    const { error: subscriptionError } = await db
      .from("subscriptions")
      .update({ last_paid_invoice_id: invoice.id })
      .eq("stripe_subscription_id", subscriptionId);
    if (subscriptionError) throw new Error("Couldn't update invoice state.");
  }
  if (subscriptionId && syncSubscription)
    await syncStripeSubscriptionById(
      subscriptionId,
      eventCreated,
      paid ? invoice.id : undefined,
    );
}

async function syncSubscriptionInvoices(stripeSubscriptionId: string) {
  const { data: invoices } = await getStripe().invoices.list({
    subscription: stripeSubscriptionId,
    limit: 100,
  });
  for (const invoice of invoices)
    await syncStripeInvoice(invoice, Math.floor(Date.now() / 1000), false);
}

async function deferAttempt(id: string, failures: number) {
  await adminClient()
    .from("billing_attempts")
    .update({
      next_reconcile_at: retryAt(failures, 60_000, 6 * 60 * 60_000),
      reconciliation_locked_until: null,
    })
    .eq("id", id)
    .eq("status", "PENDING");
}

async function deferSubscription(id: string, failures: number) {
  await adminClient()
    .from("subscriptions")
    .update({
      next_reconcile_at: retryAt(failures, 15 * 60_000, 24 * 60 * 60_000),
      reconciliation_locked_until: null,
    })
    .eq("id", id);
}

export async function reconcileDueBillingRecords() {
  const db = adminClient();
  const [
    { data: attempts, error: attemptsError },
    { data: subscriptions, error: subscriptionsError },
  ] = await Promise.all([
    db.rpc("claim_due_billing_attempts", { p_limit: 25, p_lock_seconds: 300 }),
    db.rpc("claim_due_stripe_subscriptions", {
      p_limit: 50,
      p_lock_seconds: 300,
    }),
  ]);
  if (attemptsError || subscriptionsError)
    throw new Error("Couldn't claim due billing records.");
  let repairedAttempts = 0;
  let repairedSubscriptions = 0;
  const stripe = getStripe();
  for (const attempt of attempts ?? []) {
    try {
      let checkout: Stripe.Checkout.Session | undefined;
      if (attempt.stripe_checkout_session_id)
        checkout = await stripe.checkout.sessions.retrieve(
          attempt.stripe_checkout_session_id,
        );
      else if (attempt.stripe_customer_id) {
        const sessions = await stripe.checkout.sessions.list({
          customer: attempt.stripe_customer_id,
          limit: 100,
        });
        checkout = sessions.data.find(
          (session) =>
            session.metadata?.runly_billing_attempt_id === attempt.id,
        );
      }
      if (checkout)
        await syncCheckoutAttempt(checkout, Math.floor(Date.now() / 1000));
      else await deferAttempt(attempt.id, attempt.reconcile_failures);
      repairedAttempts++;
    } catch {
      await deferAttempt(attempt.id, attempt.reconcile_failures);
    }
  }
  for (const localSubscription of subscriptions ?? []) {
    try {
      const subscription = await stripe.subscriptions.retrieve(
        localSubscription.stripe_subscription_id,
      );
      const synced = await syncStripeSubscription(
        subscription,
        Math.floor(Date.now() / 1000),
      );
      if (!synced)
        throw new Error("Subscription no longer has a valid billing mapping.");
      await syncSubscriptionInvoices(subscription.id);
      repairedSubscriptions++;
    } catch {
      await deferSubscription(
        localSubscription.id,
        localSubscription.reconcile_failures,
      );
    }
  }
  return { repairedAttempts, repairedSubscriptions };
}

export async function billingState(userId: string) {
  const db = adminClient();
  const { data: customer, error: customerError } = await db
    .from("stripe_customers")
    .select("stripe_customer_id,last_reconciled_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (customerError) throw new Error("Couldn't load billing account.");
  await reconcileUserBilling(userId);
  // A paid account created before a webhook outage can have invoices but no
  // local subscription row, making it invisible to the due-record worker.
  // Repair this authenticated customer's own Stripe records on demand.
  if (customer)
    await reconcileStripeCustomerOnDemand(customer.stripe_customer_id);
  const invoiceState = await invoiceHistory(
    customer?.stripe_customer_id ?? null,
  );
  const { data: entitlements, error: entitlementError } = await db
    .from("plan_entitlements")
    .select("id,plan_id,active,starts_at,ends_at")
    .eq("user_id", userId)
    .order("starts_at", { ascending: false })
    .limit(10);
  if (entitlementError) throw new Error("Couldn't load subscription state.");
  if (!entitlements.length)
    return {
      subscription: null,
      customer: Boolean(customer),
      ...invoiceState,
    };
  const { data: subscriptions, error: subscriptionError } = await db
    .from("subscriptions")
    .select(
      "stripe_subscription_id,stripe_price_id,status,current_period_end,cancel_at_period_end,entitlement_id,updated_at",
    )
    .in(
      "entitlement_id",
      entitlements.map((item) => item.id),
    )
    .order("updated_at", { ascending: false })
    .limit(10);
  if (subscriptionError) throw new Error("Couldn't load subscription state.");
  const active =
    subscriptions.find((item) =>
      entitlements.some(
        (entitlement) =>
          entitlement.id === item.entitlement_id && entitlement.active,
      ),
    ) ??
    subscriptions[0] ??
    null;
  const entitlement = active
    ? (entitlements.find((item) => item.id === active.entitlement_id) ?? null)
    : entitlements[0];
  return {
    customer: Boolean(customer),
    ...invoiceState,
    subscription:
      active && entitlement
        ? {
            plan: entitlement.plan_id,
            active: entitlement.active,
            status: active.status,
            currentPeriodEnd: active.current_period_end,
            cancelAtPeriodEnd: active.cancel_at_period_end,
          }
        : null,
  };
}

export async function syncStripeSubscription(
  subscription: Stripe.Subscription,
  eventCreated: number,
  paidInvoiceId?: string,
) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const price = subscription.items.data[0]?.price;
  const product = price?.product;
  const productId =
    typeof product === "string" ? product : product ? product.id : undefined;
  if (!price || !productId) return false;
  const db = adminClient();
  const { data: plan, error: planError } = await db
    .from("subscription_plans")
    .select("id")
    .eq("stripe_product_id", productId)
    .maybeSingle();
  if (planError || !plan) return false;
  const planId = plan.id;
  const { data: customer, error: customerError } = await db
    .from("stripe_customers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (customerError || !customer) return false;
  const { data: existingSubscription, error: existingError } = await db
    .from("subscriptions")
    .select("id,entitlement_id,stripe_event_created")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (existingError) throw new Error("Couldn't load subscription record.");
  if (
    existingSubscription &&
    existingSubscription.stripe_event_created > eventCreated
  )
    return true;

  const active = accessStatuses.has(subscription.status);
  const periodEnd = subscriptionPeriodEnd(subscription);
  let entitlementId = existingSubscription?.entitlement_id;
  if (entitlementId) {
    const { error } = await db
      .from("plan_entitlements")
      .update({ plan_id: planId, active, ends_at: periodEnd })
      .eq("id", entitlementId)
      .eq("user_id", customer.user_id);
    if (error) throw new Error("Couldn't update subscription entitlement.");
  } else {
    const { data, error } = await db
      .from("plan_entitlements")
      .insert({
        user_id: customer.user_id,
        plan_id: planId,
        active,
        starts_at: new Date(subscription.start_date * 1000).toISOString(),
        ends_at: periodEnd,
      })
      .select("id")
      .single();
    if (error) throw new Error("Couldn't create subscription entitlement.");
    entitlementId = data.id;
  }
  if (active) {
    const { error } = await db
      .from("plan_entitlements")
      .update({ active: false })
      .eq("user_id", customer.user_id)
      .neq("id", entitlementId)
      .eq("active", true);
    if (error)
      throw new Error("Couldn't retire previous subscription entitlement.");
  }
  const { error: subscriptionError } = await db.from("subscriptions").upsert(
    {
      ...(existingSubscription ? { id: existingSubscription.id } : {}),
      entitlement_id: entitlementId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      stripe_price_id: price.id,
      stripe_product_id: productId,
      status: subscription.status,
      current_period_end: periodEnd,
      cancel_at_period_end: subscription.cancel_at_period_end,
      stripe_event_created: eventCreated,
      user_id: customer.user_id,
      last_stripe_sync_at: new Date().toISOString(),
      ...(paidInvoiceId ? { last_paid_invoice_id: paidInvoiceId } : {}),
      next_reconcile_at: nextSubscriptionReconciliation(subscription),
      reconcile_failures: 0,
      reconciliation_locked_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_subscription_id" },
  );
  if (subscriptionError) throw new Error("Couldn't save subscription state.");
  return true;
}

export async function syncStripeSubscriptionById(
  stripeSubscriptionId: string,
  eventCreated: number,
  paidInvoiceId?: string,
) {
  const subscription =
    await getStripe().subscriptions.retrieve(stripeSubscriptionId);
  return syncStripeSubscription(subscription, eventCreated, paidInvoiceId);
}

export async function claimWebhook(event: Stripe.Event, payload: string) {
  const db = adminClient();
  const payloadHash = createHash("sha256").update(payload).digest("hex");
  const { data, error } = await db.rpc("claim_stripe_webhook_event", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_payload_sha256: payloadHash,
  });
  if (error || !["claimed", "completed", "processing"].includes(data))
    throw new Error("Couldn't claim webhook event.");
  return data as "claimed" | "completed" | "processing";
}

export async function completeWebhook(eventId: string) {
  const { error } = await adminClient().rpc("complete_stripe_webhook_event", {
    p_event_id: eventId,
  });
  if (error) throw new Error("Couldn't complete webhook event.");
}

export async function releaseWebhook(eventId: string) {
  await adminClient().rpc("release_stripe_webhook_event", {
    p_event_id: eventId,
  });
}
