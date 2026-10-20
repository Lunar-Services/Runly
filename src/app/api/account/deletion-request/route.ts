import { z } from "zod";
import {
  adminClient,
  auditAction,
  ApiError,
  body,
  failure,
  rateLimit,
  sameOrigin,
  session,
} from "@/lib/api";

const noStore = { "Cache-Control": "no-store" };
const requestSchema = z
  .object({
    email: z.email().max(254),
    acknowledge: z.literal(true),
  })
  .strict();

export async function GET() {
  try {
    const { db, user } = await session();
    const { data, error } = await db
      .from("account_deletion_requests")
      .select("status, requested_at, cancelled_at")
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new ApiError(502, "Couldn't load your deletion request.");

    return Response.json(
      {
        email: user.email ?? "",
        request: data
          ? {
              status: data.status,
              requestedAt: data.requested_at,
              cancelledAt: data.cancelled_at,
            }
          : null,
      },
      { headers: noStore },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await session();
    await rateLimit(request, "account-deletion-request", user.id, 3);

    const input = requestSchema.safeParse(await body(request, 2048));
    if (!input.success)
      throw new ApiError(
        400,
        "Enter your account email and confirm that you understand the review process.",
      );
    if (
      !user.email ||
      input.data.email.trim().toLowerCase() !== user.email.trim().toLowerCase()
    )
      throw new ApiError(400, "Enter the email address on your Runly account.");

    // Keep repeated submissions idempotent. The unique partial index also
    // protects against two simultaneous submissions.
    const { data: existing, error: lookupError } = await db
      .from("account_deletion_requests")
      .select("status, requested_at")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .maybeSingle();
    if (lookupError)
      throw new ApiError(502, "Couldn't check your deletion request.");
    if (existing)
      return Response.json(
        {
          request: {
            status: existing.status,
            requestedAt: existing.requested_at,
            cancelledAt: null,
          },
          message:
            "Your request is already recorded for operator review. Your account and project data remain active until the request is reviewed and any required cleanup is complete.",
        },
        { headers: noStore },
      );

    const { data, error } = await adminClient()
      .from("account_deletion_requests")
      .insert({ user_id: user.id, email: user.email, status: "pending" })
      .select("status, requested_at, cancelled_at")
      .single();

    if (error?.code === "23505") {
      const { data: concurrent } = await db
        .from("account_deletion_requests")
        .select("status, requested_at, cancelled_at")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();
      if (concurrent)
        return Response.json(
          {
            request: {
              status: concurrent.status,
              requestedAt: concurrent.requested_at,
              cancelledAt: concurrent.cancelled_at,
            },
            message: "Your deletion request is recorded for operator review.",
          },
          { headers: noStore },
        );
    }
    if (error || !data)
      throw new ApiError(502, "Your deletion request couldn't be recorded.");

    await auditAction(user.id, "account.deletion_requested", {
      request_id: data.requested_at,
    });

    return Response.json(
      {
        request: {
          status: data.status,
          requestedAt: data.requested_at,
          cancelledAt: data.cancelled_at,
        },
        message:
          "Your request has been recorded for operator review. Your account and project data remain active until the request is reviewed and any required cleanup is complete.",
      },
      { headers: noStore },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await session();
    await rateLimit(request, "account-deletion-cancel", user.id, 5);

    const { data, error } = await adminClient()
      .from("account_deletion_requests")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (error)
      throw new ApiError(502, "Your deletion request couldn't be cancelled.");
    if (!data)
      throw new ApiError(
        409,
        "There is no pending deletion request to cancel.",
      );

    await auditAction(user.id, "account.deletion_cancelled", {
      request_id: data.id,
    });

    return Response.json(
      {
        request: null,
        message: "Deletion request cancelled. Your account remains active.",
      },
      { headers: noStore },
    );
  } catch (error) {
    return failure(error);
  }
}
