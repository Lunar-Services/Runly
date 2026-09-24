import { failure, session } from "@/lib/api";
import { billingState } from "@/lib/billing";

export async function GET() {
  try {
    const { user } = await session();
    return Response.json(await billingState(user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
