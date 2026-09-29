import { z } from "zod";
import { ApiError, body, failure, sameOrigin, session } from "@/lib/api";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string; chatId: string }> },
) {
  try {
    sameOrigin(request);
    const { projectId, chatId } = await params;
    if (
      !z.string().uuid().safeParse(projectId).success ||
      !z.string().uuid().safeParse(chatId).success
    )
      throw new ApiError(400, "Invalid project or chat.");
    const input = z
      .object({ title: z.string().trim().min(1).max(80) })
      .safeParse(await body(request, 4096));
    if (!input.success)
      throw new ApiError(400, "Enter a chat name up to 80 characters.");
    const { db } = await session();
    const { data: chat } = await db
      .from("conversations")
      .select("id")
      .eq("id", chatId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!chat) throw new ApiError(404, "Chat not found.");
    const { error } = await db
      .from("conversations")
      .update({ title: input.data.title })
      .eq("id", chatId)
      .eq("project_id", projectId);
    if (error) throw new ApiError(502, "Couldn't rename this chat.");
    return Response.json({ chat: { id: chatId, title: input.data.title } });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; chatId: string }> },
) {
  try {
    sameOrigin(request);
    const { projectId, chatId } = await params;
    if (
      !z.string().uuid().safeParse(projectId).success ||
      !z.string().uuid().safeParse(chatId).success
    )
      throw new ApiError(400, "Invalid project or chat.");
    const { db } = await session();
    const { data: chat } = await db
      .from("conversations")
      .select("id")
      .eq("id", chatId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!chat) throw new ApiError(404, "Chat not found.");
    const { error } = await db
      .from("conversations")
      .delete()
      .eq("id", chatId)
      .eq("project_id", projectId);
    if (error) throw new ApiError(502, "Couldn't delete this chat.");
    return Response.json({ deleted: true });
  } catch (error) {
    return failure(error);
  }
}
