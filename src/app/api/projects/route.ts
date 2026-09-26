import { z } from "zod";
import { ApiError, body, failure, sameOrigin, session } from "@/lib/api";
import { projectNameFromPrompt } from "@/lib/project-name";

export async function GET() {
  try {
    const { db, user } = await session();
    const { data, error } = await db
      .from("projects")
      .select("id,name,status,created_at,updated_at")
      .eq("owner_id", user.id)
      .neq("status", "archived")
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
    const { db, user } = await session();
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
    // Insert without a PostgREST representation request. This avoids a second RLS
    // read in the same request, which was making legitimate inserts look failed.
    const now = new Date().toISOString();
    const project = {
      id: crypto.randomUUID(),
      name: input.data.name || projectNameFromPrompt(input.data.prompt || ""),
      owner_id: user.id,
      status: "draft",
      created_at: now,
      updated_at: now,
    };
    const { error } = await db.from("projects").insert(project);
    if (error) {
      console.error("Runly project creation failed", error.code);
      throw new ApiError(
        error.code === "42501" ? 403 : 502,
        error.code === "42501"
          ? "You don't have permission to create a project in this workspace."
          : "Couldn't create the project. Please try again.",
      );
    }
    let conversationId: string | null = null;
    if (input.data.prompt) {
      conversationId = crypto.randomUUID();
      const { error: conversationError } = await db
        .from("conversations")
        .insert({
          id: conversationId,
          project_id: project.id,
          created_at: now,
        });
      const { error: messageError } = conversationError
        ? { error: conversationError }
        : await db.from("messages").insert({
            id: crypto.randomUUID(),
            conversation_id: conversationId,
            actor_id: user.id,
            role: "user",
            body: input.data.prompt,
            created_at: now,
          });
      if (conversationError || messageError) {
        await db.from("projects").delete().eq("id", project.id);
        throw new ApiError(
          502,
          "Couldn't save the first project message. Please try again.",
        );
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
