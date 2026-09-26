import { z } from "zod";
import { ApiError, failure, session } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    if (!z.string().uuid().safeParse(projectId).success)
      throw new ApiError(400, "Invalid project.");
    const { db } = await session();
    const { data: project, error } = await db
      .from("projects")
      .select("id,name,status,created_at,updated_at")
      .eq("id", projectId)
      .maybeSingle();
    if (error) throw new ApiError(502, "Couldn't load this project.");
    if (!project) throw new ApiError(404, "Project not found.");
    const { data: conversation } = await db
      .from("conversations")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const { data: messages, error: messagesError } = conversation
      ? await db
          .from("messages")
          .select("id,role,body,created_at")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: true })
          .limit(200)
      : { data: [], error: null };
    if (messagesError)
      throw new ApiError(502, "Couldn't load the project conversation.");
    return Response.json(
      {
        project,
        conversationId: conversation?.id || null,
        messages: messages || [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
