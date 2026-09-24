import { z } from "zod";
import {
  ApiError,
  appOrigin,
  body,
  failure,
  sameOrigin,
  session,
} from "@/lib/api";
import {
  BillingReconciliationUnavailableError,
  CheckoutPendingError,
  createCheckout,
} from "@/lib/billing";
import { StripeConfigurationError } from "@/lib/stripe";

const checkoutInput = z.object({
  plan: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
});

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await session();
    if (!user.email)
      throw new ApiError(
        400,
        "Your account needs a verified email before billing can begin.",
      );
    const parsed = checkoutInput.safeParse(await body(request, 1024));
    if (!parsed.success) throw new ApiError(400, "Choose a valid plan.");
    const url = await createCheckout(
      user.id,
      user.email,
      parsed.data.plan,
      appOrigin(request),
    );
    return Response.json({ url });
  } catch (error) {
    if (error instanceof StripeConfigurationError)
      return Response.json(
        { message: "Billing is not configured yet. Please try again later." },
        { status: 503 },
      );
    if (error instanceof BillingReconciliationUnavailableError)
      return Response.json(
        {
          message:
            "Billing is temporarily unavailable. Please try again shortly.",
        },
        { status: 503 },
      );
    if (error instanceof CheckoutPendingError)
      return Response.json({ message: error.message }, { status: 409 });
    if (
      error instanceof Error &&
      /^(You already have|Choose a valid)/.test(error.message)
    )
      return Response.json({ message: error.message }, { status: 409 });
    return failure(error);
  }
}
