import { body, failure, sameOrigin, session } from "@/lib/api";
import { cancelAtPeriodEnd } from "@/lib/billing";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await session();
    const parsed = await body(request, 1024);
    if (parsed?.action !== "cancel")
      throw new Error("Invalid billing request.");
    await cancelAtPeriodEnd(user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
