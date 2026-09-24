import { z } from "zod";
import {
  adminClient,
  adminSession,
  ApiError,
  body,
  failure,
  sameOrigin,
} from "@/lib/api";
import { getMonthlyPrice, StripeConfigurationError } from "@/lib/stripe";

function planFailure(error: unknown) {
  if (
    error instanceof StripeConfigurationError &&
    error.message === "Billing is not configured."
  )
    return Response.json(
      {
        message:
          "Stripe verification is unavailable. In local development, add an sk_test key and start with pnpm dev:stripe.",
      },
      { status: 503 },
    );
  if (error instanceof StripeConfigurationError)
    return Response.json(
      {
        message:
          "This Price cannot be used: it must be active, USD, monthly recurring, and belong to the selected Stripe Product.",
      },
      { status: 400 },
    );
  if (
    error instanceof Error &&
    /No such price|No such product|does not have access|live mode/i.test(
      error.message,
    )
  )
    return Response.json(
      {
        message:
          "Stripe could not verify that Product and Price. Use IDs from the same Stripe account and mode as STRIPE_SECRET_KEY (test with sk_test, live with sk_live).",
      },
      { status: 400 },
    );
  return failure(error);
}

const planInput = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
    name: z.string().trim().min(2).max(80),
    stripeProductId: z.string().regex(/^prod_[A-Za-z0-9]+$/),
    stripePriceId: z.string().regex(/^price_[A-Za-z0-9]+$/),
    window3hTokens: z.number().int().min(1).max(100_000_000),
    window7dTokens: z.number().int().min(1).max(1_000_000_000),
    projectCap: z.number().int().min(1).max(1_000_000).nullable(),
    active: z.boolean(),
  })
  .strict();

const planStatusInput = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
    active: z.boolean(),
  })
  .strict();

export async function GET() {
  try {
    await adminSession();
    const { data, error } = await adminClient()
      .from("subscription_plans")
      .select(
        "id,name,active,price_cents,stripe_product_id,stripe_price_id,window_3h_tokens,window_7d_tokens,project_cap",
      )
      .order("price_cents", { ascending: true });
    if (error) throw new Error("Couldn't load the product catalog.");
    return Response.json(
      { plans: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return planFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    await adminSession();
    const parsed = planInput.safeParse(await body(request, 4096));
    if (!parsed.success)
      throw new ApiError(400, "Check the product details and try again.");
    const input = parsed.data;
    const db = adminClient();
    const { data: existing, error: existingError } = await db
      .from("subscription_plans")
      .select("stripe_product_id")
      .eq("id", input.id)
      .maybeSingle();
    if (existingError) throw new Error("Couldn't load the existing product.");
    if (
      existing?.stripe_product_id &&
      existing.stripe_product_id !== input.stripeProductId
    ) {
      const { count, error: entitlementError } = await db
        .from("plan_entitlements")
        .select("id", { count: "exact", head: true })
        .eq("plan_id", input.id)
        .eq("active", true);
      if (entitlementError)
        throw new Error("Couldn't check active subscriptions.");
      if (count)
        throw new ApiError(
          409,
          "Deactivate or migrate active subscriptions before changing this Product ID.",
        );
    }
    const price = await getMonthlyPrice(
      input.stripeProductId,
      input.stripePriceId,
    );
    const { error } = await db.from("subscription_plans").upsert(
      {
        id: input.id,
        name: input.name,
        active: input.active,
        price_cents: price.unit_amount,
        stripe_product_id: input.stripeProductId,
        stripe_price_id: price.id,
        window_3h_tokens: input.window3hTokens,
        window_7d_tokens: input.window7dTokens,
        project_cap: input.projectCap,
      },
      { onConflict: "id" },
    );
    if (error?.code === "23505")
      throw new ApiError(
        409,
        "That Stripe Product or Price is already registered to another plan.",
      );
    if (error) throw new Error("Couldn't save the product.");
    return Response.json({ message: "Product saved." });
  } catch (error) {
    return planFailure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    sameOrigin(request);
    await adminSession();
    const parsed = planStatusInput.safeParse(await body(request, 1024));
    if (!parsed.success)
      throw new ApiError(400, "Check the plan status and try again.");
    const { data, error } = await adminClient()
      .from("subscription_plans")
      .update({ active: parsed.data.active })
      .eq("id", parsed.data.id)
      .select("id,active")
      .maybeSingle();
    if (error) throw new Error("Couldn't update the plan status.");
    if (!data) throw new ApiError(404, "This product no longer exists.");
    return Response.json({ plan: data });
  } catch (error) {
    return failure(error);
  }
}
