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
import { projectNameFromPrompt } from "@/lib/project-name";
import { enqueueRuntime } from "@/lib/runtime/server";

export async function GET() {
  try {
    const { db, user } = await session();
    const { data, error } = await db
      .from("projects")
      .select("id,name,status,deletion_requested_at,created_at,updated_at")
      .eq("owner_id", user.id)
      .or("status.neq.archived,deletion_requested_at.not.is.null")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error)
      throw new ApiError(502, "Couldn't load your projects. Please retry.");
    return Response.json(
      { projects: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await session();
    await rateLimit(request, "project-create", user.id, 10);
    const input = z
      .object({
        name: z.string().trim().min(1).max(160).optional(),
        prompt: z.string().trim().min(1).max(12_000).optional(),
      })
      .refine((value) => value.name || value.prompt)
      .safeParse(await body(request, 16_384));
    if (!input.success)
      throw new ApiError(
        400,
        "Enter a project name or describe what you want to build.",
      );
    // The service role writes only the authenticated user's project. Browser
    // credentials cannot insert directly and bypass this route's admission.
    const now = new Date().toISOString();
    const project = {
      id: crypto.randomUUID(),
      name: input.data.name || projectNameFromPrompt(input.data.prompt || ""),
      owner_id: user.id,
      status: "draft",
      created_at: now,
      updated_at: now,
    };
    const { error } = await adminClient().from("projects").insert(project);
    if (error) {
      console.error("Runly project creation failed", error.code);
      throw new ApiError(502, "Couldn't create the project. Please try again.");
    }
    let conversationId: string | null = null;
    if (input.data.prompt) {
      conversationId = crypto.randomUUID();
      try {
        await enqueueRuntime(
          project.id,
          user.id,
          "agent",
          conversationId,
          conversationId,
          input.data.prompt,
        );
      } catch (error) {
        await adminClient()
          .from("projects")
          .delete()
          .eq("id", project.id)
          .eq("owner_id", user.id);
        throw error;
      }
    }
    return Response.json(
      {
        project: {
          id: project.id,
          name: project.name,
          status: project.status,
          created_at: project.created_at,
          updated_at: project.updated_at,
        },
        conversationId,
      },
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
