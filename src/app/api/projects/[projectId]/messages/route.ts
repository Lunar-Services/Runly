import { z } from "zod";
import {
  ApiError,
  body,
  failure,
  sameOrigin,
  session,
  rateLimit,
  adminClient,
} from "@/lib/api";
import { enqueueRuntime } from "@/lib/runtime/server";
import { workspaceFailure } from "@/lib/workspace-server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    sameOrigin(request);
    const { projectId } = await params;
    if (!z.string().uuid().safeParse(projectId).success)
      throw new ApiError(400, "Invalid project.");
    const input = z
      .object({
        message: z.string().trim().min(1).max(12_000),
        chatId: z.string().uuid().optional(),
        requestId: z.string().uuid(),
        generate: z.boolean().default(false),
      })
      .safeParse(await body(request, 16_384));
    if (!input.success) throw new ApiError(400, "Write a message first.");
    const { db, user } = await session();
    await rateLimit(request, "agent-message", user.id, 10);
    const { data: project } = await db
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new ApiError(404, "Project not found.");
    let conversation = input.data.chatId
      ? (
          await db
            .from("conversations")
            .select("id")
            .eq("project_id", projectId)
            .eq("id", input.data.chatId)
            .maybeSingle()
        ).data
      : null;
    if (input.data.chatId && !conversation)
      throw new ApiError(404, "Chat not found in this project.");
    // The transaction creates this deterministic chat ID if needed, so retries
    // cannot create orphan conversations or bill the same message twice.
    if (!conversation) conversation = { id: input.data.requestId };
    const message = {
      id: input.data.requestId,
      conversation_id: conversation.id,
      actor_id: user.id,
      role: "user" as const,
      body: input.data.message,
      created_at: new Date().toISOString(),
    };
    if (input.data.generate) {
      await enqueueRuntime(
        projectId,
        user.id,
        "agent",
        message.id,
        conversation.id,
        input.data.message,
      );
    } else {
      const { error } = await adminClient().rpc("persist_workspace_message", {
        p_project: projectId,
        p_actor: user.id,
        p_id: message.id,
        p_chat: conversation.id,
        p_input: input.data.message,
      });
      if (error) workspaceFailure(error.message);
    }
    const { data: stored, error: storedError } = await db
      .from("messages")
      .select("id,role,body,created_at")
      .eq("id", message.id)
      .eq("conversation_id", conversation.id)
      .single();
    if (storedError || !stored)
      throw new ApiError(
        502,
        "Your message was saved but couldn't be reloaded. Refresh the conversation.",
      );
    return Response.json(
      {
        message: stored,
        conversationId: conversation.id,
        jobId: input.data.generate ? message.id : null,
        generation: input.data.generate
          ? { state: "queued" }
          : {
              state: "unavailable",
              message:
                "Your message is saved. Code generation needs the project runtime, which has not been configured.",
            },
      },
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
