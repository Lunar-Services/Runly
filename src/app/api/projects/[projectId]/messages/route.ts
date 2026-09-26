import { z } from "zod";
import { ApiError, body, failure, sameOrigin, session } from "@/lib/api";

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
      .object({ message: z.string().trim().min(1).max(12_000) })
      .safeParse(await body(request, 16_384));
    if (!input.success) throw new ApiError(400, "Write a message first.");
    const { db, user } = await session();
    const { data: project } = await db
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new ApiError(404, "Project not found.");
    let { data: conversation } = await db
      .from("conversations")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!conversation) {
      conversation = { id: crypto.randomUUID() };
      const { error } = await db.from("conversations").insert({
        id: conversation.id,
        project_id: projectId,
      });
      if (error)
        throw new ApiError(502, "Couldn't start the project conversation.");
    }
    const message = {
      id: crypto.randomUUID(),
      conversation_id: conversation.id,
      actor_id: user.id,
      role: "user" as const,
      body: input.data.message,
      created_at: new Date().toISOString(),
    };
    const { error } = await db.from("messages").insert(message);
    if (error) throw new ApiError(502, "Couldn't save your message.");
    return Response.json(
      {
        message: {
          id: message.id,
          role: message.role,
          body: message.body,
          created_at: message.created_at,
        },
        conversationId: conversation.id,
      },
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
