import { z } from "zod";
import {
  adminClient,
  ApiError,
  appOrigin,
  body,
  failure,
  rateLimit,
  sameOrigin,
} from "@/lib/api";
import { publishSnapshot } from "@/lib/project-sharing";
import { recordWorkspaceAction, workspaceAccess } from "@/lib/workspace-server";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    await workspaceAccess(projectId, true);
    const { data, error } = await adminClient()
      .from("project_shares")
      .select("enabled,token,version_id,expires_at,source_visible")
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) throw new ApiError(502, "Couldn't load project sharing.");
    const enabled = Boolean(
      data?.enabled && Date.parse(data.expires_at) > Date.now(),
    );
    return Response.json(
      {
        enabled: enabled && Boolean(data?.source_visible),
        published: enabled && !data?.source_visible,
        sourceVisible: Boolean(data?.source_visible),
        expiresAt: data?.expires_at || null,
        versionId: data?.version_id || null,
        url:
          enabled && data?.source_visible
            ? `${appOrigin(request)}/api/shared/${data!.token}`
            : null,
        siteUrl: enabled
          ? `${appOrigin(request)}/api/shared/${data!.token}/site/`
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request, context: Context) {
  try {
    sameOrigin(request);
    const { projectId } = await context.params;
    const { user, project } = await workspaceAccess(projectId, true);
    await rateLimit(request, "project-share", user.id, 10);
    const input = z
      .object({ enabled: z.boolean() })
      .strict()
      .parse(await body(request, 1024));
    if (input.enabled) {
      if (project.status === "archived")
        throw new ApiError(409, "Restore this project before sharing it.");
      return Response.json(
        await publishSnapshot(request, projectId, user.id, "project.shared"),
      );
    }
    const { error } = await adminClient()
      .from("project_shares")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("project_id", projectId);
    if (error) throw new ApiError(502, "Couldn't turn sharing off.");
    await recordWorkspaceAction(user.id, projectId, "project.unshared");
    return Response.json({ enabled: false, url: null });
  } catch (error) {
    return failure(error);
  }
}
