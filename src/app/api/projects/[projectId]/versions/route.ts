import { z } from "zod";
import {
  adminClient,
  ApiError,
  body,
  failure,
  rateLimit,
  sameOrigin,
} from "@/lib/api";
import { snapshotVersion, workspaceAccess } from "@/lib/workspace-server";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    await workspaceAccess(projectId);
    const { data, error } = await adminClient()
      .from("project_versions")
      .select("id,description,created_at,actor_id")
      .eq("project_id", projectId)
      .is("encrypted_manifest", null)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new ApiError(502, "Couldn't load version history.");
    return Response.json(
      { versions: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const { projectId } = await context.params;
    const { user } = await workspaceAccess(projectId);
    await rateLimit(request, "workspace-version", user.id, 20);
    const input = z
      .object({ description: z.string().trim().min(1).max(160) })
      .strict()
      .parse(await body(request, 2048));
    return Response.json(
      {
        versionId: await snapshotVersion(projectId, user.id, input.description),
      },
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
