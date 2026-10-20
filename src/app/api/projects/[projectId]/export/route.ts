import { failure, rateLimit } from "@/lib/api";
import {
  recordWorkspaceAction,
  savedFiles,
  workspaceAccess,
} from "@/lib/workspace-server";
export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const { user, project } = await workspaceAccess(projectId);
    await rateLimit(request, "project-export", user.id, 10);
    const files = await savedFiles(projectId);
    await recordWorkspaceAction(user.id, projectId, "project.exported", {
      file_count: files.length,
    });
    return Response.json(
      {
        format: "runly-source",
        version: 1,
        exportedAt: new Date().toISOString(),
        project: { id: project.id, name: project.name },
        files,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="runly-${projectId}.json"`,
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    return failure(error);
  }
}
