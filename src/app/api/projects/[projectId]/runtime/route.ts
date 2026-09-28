import { z } from "zod";
import { body, failure, sameOrigin, rateLimit } from "@/lib/api";
import {
  enqueueRuntime,
  runtimeAccess,
  runtimeView,
} from "@/lib/runtime/server";
type Context = { params: Promise<{ projectId: string }> };
export const runtime = "nodejs";
export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const { user } = await runtimeAccess(projectId);
    return Response.json(await runtimeView(projectId, user.id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const { projectId } = await context.params;
    const { user } = await runtimeAccess(projectId);
    await rateLimit(request, "runtime-control", user.id, 10);
    const input = z
      .object({
        action: z.enum(["start", "stop"]),
        requestId: z.string().uuid(),
      })
      .parse(await body(request, 2048));
    await enqueueRuntime(projectId, user.id, input.action, input.requestId);
    return Response.json(
      { id: input.requestId, state: "queued" },
      { status: 202 },
    );
  } catch (error) {
    return failure(error);
  }
}
