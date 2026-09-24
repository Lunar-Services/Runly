import { z } from "zod";
import { ApiError, body, failure, sameOrigin, session } from "@/lib/api";

export async function GET() {
  try {
    const { db, user } = await session();
    const { data, error } = await db.from("projects").select("id,name,status,created_at,updated_at").eq("owner_id", user.id).neq("status", "archived").order("updated_at", { ascending: false }).limit(100);
    if (error) throw new ApiError(502, "Couldn't load your projects. Please retry.");
    return Response.json({ projects: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await session();
    const input = z.object({ name: z.string().trim().min(1).max(160) }).safeParse(await body(request, 4096));
    if (!input.success) throw new ApiError(400, "Enter a project name between 1 and 160 characters.");
    // Insert without a PostgREST representation request. This avoids a second RLS
    // read in the same request, which was making legitimate inserts look failed.
    const now = new Date().toISOString();
    const project = { id: crypto.randomUUID(), name: input.data.name, owner_id: user.id, status: "draft", created_at: now, updated_at: now };
    const { error } = await db.from("projects").insert(project);
    if (error) {
      console.error("Runly project creation failed", error.code);
      throw new ApiError(error.code === "42501" ? 403 : 502, error.code === "42501" ? "You don't have permission to create a project in this workspace." : "Couldn't create the project. Please try again.");
    }
    return Response.json({ project: { id: project.id, name: project.name, status: project.status, created_at: project.created_at, updated_at: project.updated_at } }, { status: 201 });
  } catch (error) { return failure(error); }
}
