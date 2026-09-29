import { z } from "zod";
import {
  ApiError,
  adminClient,
  body,
  failure,
  sameOrigin,
  session,
} from "@/lib/api";

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
      .select("id,name,status,created_at,updated_at,owner_id")
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
        project: {
          id: project.id,
          name: project.name,
          status: project.status,
          created_at: project.created_at,
          updated_at: project.updated_at,
          canManage: project.owner_id === user.id,
        },
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    sameOrigin(request);
    const { db, user } = await session();
    const { projectId } = await params;
    if (!z.string().uuid().safeParse(projectId).success)
      throw new ApiError(400, "Invalid project.");
    const input = z
      .object({ name: z.string().trim().min(1).max(160) })
      .strict()
      .safeParse(await body(request, 2048));
    if (!input.success)
      throw new ApiError(
        400,
        "Enter a project name between 1 and 160 characters.",
      );
    const { data: project, error } = await db
      .from("projects")
      .update({ name: input.data.name, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .select("id,name,status,updated_at")
      .maybeSingle();
    if (error)
      throw new ApiError(502, "Couldn't rename the project. Please retry.");
    if (!project)
      throw new ApiError(404, "Project not found or you aren't its owner.");
    return Response.json(
      { project },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    sameOrigin(request);
    const { db, user } = await session();
    const { projectId } = await params;
    if (!z.string().uuid().safeParse(projectId).success)
      throw new ApiError(400, "Invalid project.");
    const { data: project, error: lookupError } = await db
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (lookupError)
      throw new ApiError(502, "Couldn't check this project. Please retry.");
    if (!project)
      throw new ApiError(404, "Project not found or you aren't its owner.");
    // Don't discard an active sandbox or in-flight usage accounting.
    const admin = adminClient();
    const [runtime, jobs] = await Promise.all([
      admin
        .from("project_runtimes")
        .select("state,session_id")
        .eq("project_id", projectId)
        .maybeSingle(),
      admin
        .from("runtime_jobs")
        .select("id")
        .eq("project_id", projectId)
        .in("state", ["queued", "running"])
        .limit(1),
    ]);
    if (runtime.error || jobs.error)
      throw new ApiError(
        503,
        "Couldn't verify project activity. Please retry.",
      );
    if (
      runtime.data?.session_id ||
      ["starting", "ready"].includes(runtime.data?.state || "") ||
      jobs.data?.length
    )
      throw new ApiError(
        409,
        "Stop this project's workspace and wait for its tasks to finish before deleting it.",
      );
    const { data, error } = await db
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .select("id")
      .maybeSingle();
    if (error)
      throw new ApiError(502, "Couldn't delete the project. Please retry.");
    if (!data)
      throw new ApiError(404, "Project not found or you aren't its owner.");
    return new Response(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
