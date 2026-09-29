import { z } from "zod";
import {
  ApiError,
  body,
  failure,
  rateLimit,
  sameOrigin,
  session,
} from "@/lib/api";
import { enqueueRuntime, runtimeAccess } from "@/lib/runtime/server";

// Legacy endpoint: all AI work now goes through the durable sandbox job queue.
// It never calls Responses directly or uses the retired browser quota RPCs.
const inputSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(12_000),
  idempotencyKey: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await session();
    await rateLimit(request, "ai-chat", user.id, 20);
    const input = inputSchema.safeParse(await body(request, 16_384));
    if (!input.success)
      throw new ApiError(400, "Check the project and message.");
    await runtimeAccess(input.data.projectId);
    await enqueueRuntime(
      input.data.projectId,
      user.id,
      "agent",
      input.data.idempotencyKey,
      input.data.idempotencyKey,
      input.data.prompt,
    );
    return Response.json(
      {
        jobId: input.data.idempotencyKey,
        conversationId: input.data.idempotencyKey,
        state: "queued",
      },
      { status: 202 },
    );
  } catch (error) {
    return failure(error);
  }
}
