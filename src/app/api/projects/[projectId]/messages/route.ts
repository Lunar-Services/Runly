import { adminClient } from "@/lib/api";
import {
  MEDIA_BUCKET,
  mediaPath,
  mediaRefSchema,
  mediaManifestSchema,
  encodeMessage,
  reservedMessage,
} from "@/lib/chat-media";
import { z } from "zod";
import {
  ApiError,
  body,
  failure,
  sameOrigin,
  session,
  rateLimit,
} from "@/lib/api";
import { enqueueRuntime } from "@/lib/runtime/server";

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
        media: z.array(mediaRefSchema).max(4).default([]),
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
    if (reservedMessage(input.data.message))
      throw new ApiError(400, "Invalid message format.");
    for (const ref of input.data.media) {
      if (ref.owner !== user.id)
        throw new ApiError(403, "Attach media uploaded by your account.");
      const raw = await adminClient()
        .storage.from(MEDIA_BUCKET)
        .download(mediaPath(projectId, ref) + "/manifest.json");
      if (
        !raw.data ||
        !mediaManifestSchema.parse(JSON.parse(await raw.data.text())).ready
      )
        throw new ApiError(400, "Finish uploading your media first.");
    }
    let encoded: string;
    try {
      encoded = encodeMessage(input.data.message, input.data.media);
    } catch {
      throw new ApiError(400, "Your message and attachments are too long.");
    }
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
      body: encoded,
      created_at: new Date().toISOString(),
    };
    await enqueueRuntime(
      projectId,
      user.id,
      "agent",
      message.id,
      conversation.id,
      encoded,
    );
    return Response.json(
      {
        message: {
          id: message.id,
          role: message.role,
          body: message.body,
          created_at: message.created_at,
        },
        conversationId: conversation.id,
        jobId: message.id,
      },
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
