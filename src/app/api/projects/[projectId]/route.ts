import { decodeMessage } from "@/lib/chat-media";
import { z } from "zod";
import {
  adminClient,
  ApiError,
  body,
  failure,
  rateLimit,
  sameOrigin,
  session,
} from "@/lib/api";
import { enqueueRuntime } from "@/lib/runtime/server";

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
        "id,name,status,deletion_requested_at,github_repo_id,github_branch,created_at,updated_at",
      )
      .eq("id", projectId)
      .maybeSingle();
    if (error) throw new ApiError(502, "Couldn't load this project.");
    if (!project) throw new ApiError(404, "Project not found.");
    if (project.deletion_requested_at)
      throw new ApiError(
        409,
        "This project is being deleted. Finish cleanup from Projects.",
      );
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
        titles.set(message.conversation_id, decodeMessage(message.body).text);
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    sameOrigin(request);
    const { projectId } = await params;
    if (!z.string().uuid().safeParse(projectId).success)
      throw new ApiError(400, "Invalid project.");
    const { user } = await session();
    await rateLimit(request, "project-rename", user.id, 10);
    const input = z
      .object({ name: z.string().trim().min(1).max(160) })
      .safeParse(await body(request, 4096));
    if (!input.success) throw new ApiError(400, "Enter a project name.");
    const { data: project, error } = await adminClient()
      .from("projects")
      .update({ name: input.data.name, updated_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("owner_id", user.id)
      .is("deletion_requested_at", null)
      .select("id,name")
      .maybeSingle();
    if (error) throw new ApiError(502, "Couldn't rename this project.");
    if (!project) throw new ApiError(404, "Project not found.");
    return Response.json({ project });
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
    const { projectId } = await params;
    if (!z.string().uuid().safeParse(projectId).success)
      throw new ApiError(400, "Invalid project.");
    const { user } = await session();
    const db = adminClient();
    const marked = await db.rpc("mark_project_deleting", {
      p_project: projectId,
      p_actor: user.id,
    });
    if (marked.error)
      throw new ApiError(
        marked.error.message.includes("project_missing") ? 404 : 403,
        "Project not found or deletion is unavailable. Apply the latest migration.",
      );
    const { count, error: jobsError } = await db
      .from("runtime_jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .in("state", ["queued", "running"]);
    if (jobsError) throw new ApiError(503, "Couldn't check active tasks.");
    if (count)
      return Response.json({ state: "waiting-for-task" }, { status: 202 });
    const { data: runtime, error: runtimeError } = await db
      .from("project_runtimes")
      .select("state,session_id")
      .eq("project_id", projectId)
      .maybeSingle();
    if (runtimeError) throw new ApiError(503, "Couldn't check the workspace.");
    if (runtime && (runtime.state !== "stopped" || runtime.session_id)) {
      const { data: lastStop, error: stopError } = await db
        .from("runtime_jobs")
        .select("state,error")
        .eq("project_id", projectId)
        .eq("kind", "stop")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (stopError)
        throw new ApiError(503, "Couldn't check workspace cleanup.");
      if (
        lastStop?.state === "failed" &&
        new URL(request.url).searchParams.get("retry") !== "1"
      )
        throw new ApiError(
          409,
          lastStop.error ||
            "Workspace cleanup failed. Retry or contact an operator.",
        );
      await enqueueRuntime(projectId, user.id, "stop", crypto.randomUUID());
      return Response.json({ state: "stopping-workspace" }, { status: 202 });
    }
    const finished = await db.rpc("finish_project_deletion", {
      p_project: projectId,
      p_actor: user.id,
    });
    if (finished.error) {
      if (finished.error.message.includes("usage_unreconciled"))
        throw new ApiError(
          409,
          "A provider task needs usage reconciliation before this project can be deleted.",
        );
      if (/jobs_active|sandbox_active/.test(finished.error.message))
        return Response.json(
          { state: "waiting-for-workspace" },
          { status: 202 },
        );
      throw new ApiError(
        503,
        "Project deletion could not finish. Retry shortly.",
      );
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return failure(error);
  }
}
