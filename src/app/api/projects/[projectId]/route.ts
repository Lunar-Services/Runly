import { z } from "zod";
import { ApiError, failure, session } from "@/lib/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    if (!z.string().uuid().safeParse(projectId).success)
      throw new ApiError(400, "Invalid project.");
    const { db, user } = await session();
    const { data: project, error } = await db
      .from("projects")
      .select(
        "id,name,status,github_repo_id,github_branch,created_at,updated_at",
      )
      .eq("id", projectId)
      .maybeSingle();
    if (error) throw new ApiError(502, "Couldn't load this project.");
    if (!project) throw new ApiError(404, "Project not found.");
    const { data: profile } = await db
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const { data: conversations, error: conversationsError } = await db
      .from("conversations")
      .select("id,title")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (conversationsError)
      throw new ApiError(502, "Couldn't load project chats.");
    const requestedChat = new URL(request.url).searchParams.get("chat");
    if (requestedChat && !z.string().uuid().safeParse(requestedChat).success)
      throw new ApiError(400, "Invalid chat.");
    const conversation = requestedChat
      ? conversations?.find((item) => item.id === requestedChat)
      : conversations?.[0];
    if (requestedChat && !conversation)
      throw new ApiError(404, "Chat not found in this project.");
    const chatMessages = conversations?.length
      ? await db
          .from("messages")
          .select("conversation_id,role,body,created_at")
          .in(
            "conversation_id",
            conversations.map((item) => item.id),
          )
          .eq("role", "user")
          .order("created_at", { ascending: true })
      : { data: [], error: null };
    if (chatMessages.error)
      throw new ApiError(502, "Couldn't load project chat titles.");
    const titles = new Map<string, string>();
    for (const item of conversations || []) {
      if (item.title?.trim()) titles.set(item.id, item.title.trim());
    }
    for (const message of chatMessages.data || []) {
      if (!titles.has(message.conversation_id))
        titles.set(message.conversation_id, message.body);
    }
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
        userName:
          profile?.display_name?.trim() || user.email?.split("@")[0] || "there",
        conversationId: conversation?.id || null,
        chats: (conversations || []).map((item) => ({
          id: item.id,
          title: titles.get(item.id) || "New chat",
        })),
        messages: messages || [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
