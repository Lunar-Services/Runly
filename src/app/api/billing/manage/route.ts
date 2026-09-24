import { body, failure, sameOrigin, session } from "@/lib/api";
import { cancelAtPeriodEnd, withdrawCancellation } from "@/lib/billing";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await session();
    const parsed = await body(request, 1024);
    if (
      parsed?.action !== "cancel" &&
      parsed?.action !== "withdraw-cancellation"
    )
      throw new Error("Invalid billing request.");
    if (parsed.action === "cancel") await cancelAtPeriodEnd(user.id);
    else await withdrawCancellation(user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
