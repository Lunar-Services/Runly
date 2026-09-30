import { z } from "zod";
import {
  adminClient,
  ApiError,
  failure,
  rateLimit,
  sameOrigin,
  session,
} from "@/lib/api";

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
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (!project) throw new ApiError(404, "Project not found.");

    const id = crypto.randomUUID();
    const { error } = await adminClient().from("conversations").insert({
      id,
      project_id: projectId,
      title: null,
    });
    if (error) throw new ApiError(502, "Couldn't create a new chat.");
    return Response.json({ chat: { id, title: "New chat" } }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
