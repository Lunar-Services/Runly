import { appOrigin, failure, sameOrigin, session } from "@/lib/api";
import { body } from "@/lib/api";
import { z } from "zod";
import {
  BillingReconciliationUnavailableError,
  createPortal,
  createUpgradePortal,
} from "@/lib/billing";
import { StripeConfigurationError } from "@/lib/stripe";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await session();
    const parsed = z
      .object({
        plan: z
          .string()
          .regex(/^[a-z0-9][a-z0-9-]{1,62}$/)
          .optional(),
      })
      .safeParse(await body(request, 1024));
    if (!parsed.success) throw new Error("Invalid billing request.");
    const url = parsed.data.plan
      ? await createUpgradePortal(user.id, appOrigin(request), parsed.data.plan)
      : await createPortal(user.id, appOrigin(request));
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
    if (
      error instanceof Error &&
      /configuration|subscription_update|price|portal/i.test(error.message)
    )
      return Response.json(
        {
          message:
            "Stripe Customer Portal is not configured for this upgrade Price. In Stripe Dashboard → Settings → Billing → Customer portal, enable subscription updates and add this plan's monthly Price to the allowed products.",
        },
        { status: 400 },
      );
    if (error instanceof Error && error.message.includes("billing account"))
      return Response.json(
        { message: "No billing account was found." },
        { status: 404 },
      );
    return failure(error);
  }
}
