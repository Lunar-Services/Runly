import { timingSafeEqual } from "node:crypto";
import { reconcileDueBillingRecords } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidSchedulerSecret(request: Request) {
  const expected =
    process.env.RUNLY_BILLING_RECONCILIATION_SECRET ?? process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  const received = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || !received) return false;
  const expectedBytes = Buffer.from(expected);
  const receivedBytes = Buffer.from(received);
  return (
    expectedBytes.length === receivedBytes.length &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

export async function GET(request: Request) {
  if (!hasValidSchedulerSecret(request))
    return new Response("Not found.", { status: 404 });
  try {
    const reconciled = await reconcileDueBillingRecords();
    return Response.json(
      { reconciled },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    // Return an error so the scheduler retries. Do not disclose configuration
    // or Stripe details from this non-interactive endpoint.
    return new Response("Billing reconciliation failed.", { status: 503 });
  }
}
