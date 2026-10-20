import { z } from "zod";
import {
  adminClient,
  ApiError,
  failure,
  rateLimit,
  sameOrigin,
  session,
} from "@/lib/api";
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
    const { db, user } = await session();
    await rateLimit(request, "chat-create", user.id, 20);
    const { data: project } = await db
      .from("projects")
      .select("id,status")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new ApiError(404, "Project not found.");
    if (project.status === "archived")
      throw new ApiError(
        409,
        "Restore this archived project before creating a chat.",
      );

    const id = crypto.randomUUID();
    const { error } = await adminClient().rpc("mutate_workspace_chat", {
      p_project: projectId,
      p_actor: user.id,
      p_chat: id,
      p_title: null,
      p_delete: false,
    });
    if (error) workspaceFailure(error.message);
    return Response.json({ chat: { id, title: "New chat" } }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
