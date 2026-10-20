import { z } from "zod";
import {
  adminClient,
  ApiError,
  body,
  failure,
  rateLimit,
  sameOrigin,
} from "@/lib/api";
import {
  expectedFilesSchema,
  saveFiles,
  sourceFiles,
  workspaceAccess,
} from "@/lib/workspace-server";
type Context = { params: Promise<{ projectId: string; versionId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { projectId, versionId } = await context.params;
    if (!z.string().uuid().safeParse(versionId).success)
      throw new ApiError(400, "Invalid version.");
    await workspaceAccess(projectId);
    const { data, error } = await adminClient()
      .from("project_versions")
      .select("id,description,created_at,files")
      .eq("project_id", projectId)
      .eq("id", versionId)
      .is("encrypted_manifest", null)
      .maybeSingle();
    if (error) throw new ApiError(502, "Couldn't load this version.");
    if (!data || data.files === null)
      throw new ApiError(404, "This version has no source snapshot.");
    return Response.json(
      { version: { ...data, files: sourceFiles(data.files) } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const { projectId, versionId } = await context.params;
    if (!z.string().uuid().safeParse(versionId).success)
      throw new ApiError(400, "Invalid version.");
    const { user, project } = await workspaceAccess(projectId);
    if (project.status === "archived")
      throw new ApiError(409, "Restore this project before editing it.");
    await rateLimit(request, "workspace-restore", user.id, 10);
    const input = z
      .object({ expected: expectedFilesSchema })
      .strict()
      .parse(await body(request, 512 * 1024));
    const { data, error } = await adminClient()
      .from("project_versions")
      .select("files")
      .eq("project_id", projectId)
      .eq("id", versionId)
      .is("encrypted_manifest", null)
      .maybeSingle();
    if (error) throw new ApiError(502, "Couldn't load this version.");
    if (!data || data.files === null)
      throw new ApiError(404, "This version has no source snapshot.");
    return Response.json(
      await saveFiles(
        projectId,
        user.id,
        sourceFiles(data.files),
        input.expected,
        `Restored version ${versionId}`,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
