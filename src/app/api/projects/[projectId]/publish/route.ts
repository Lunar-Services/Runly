import { ApiError, failure, rateLimit, sameOrigin } from "@/lib/api";
import { publishSnapshot } from "@/lib/project-sharing";
import { savedFiles, workspaceAccess } from "@/lib/workspace-server";
export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    sameOrigin(request);
    const { projectId } = await context.params;
    const { user, project } = await workspaceAccess(projectId, true);
    await rateLimit(request, "project-publish", user.id, 5);
    if (project.status === "archived")
      throw new ApiError(409, "Restore this project before publishing it.");
    const files = await savedFiles(projectId);
    if (
      !files.some((file) => file.kind === "file" && file.path === "index.html")
    )
      throw new ApiError(
        422,
        "Static publishing needs a root index.html. Building framework apps and exporting videos require the project runtime.",
      );
    const result = await publishSnapshot(
      request,
      projectId,
      user.id,
      "project.published",
    );
    return Response.json(
      {
        ...result,
        state: "published",
        url: result.siteUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    return failure(error);
  }
}
