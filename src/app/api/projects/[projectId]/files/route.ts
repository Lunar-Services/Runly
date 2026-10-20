import { z } from "zod";
import { body, failure, rateLimit, sameOrigin, ApiError } from "@/lib/api";
import {
  expectedFilesSchema,
  saveFiles,
  savedFiles,
  sourceFiles,
  workspaceAccess,
} from "@/lib/workspace-server";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    await workspaceAccess(projectId);
    return Response.json(
      { files: await savedFiles(projectId) },
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
    const { user, project } = await workspaceAccess(projectId);
    if (project.status === "archived")
      throw new ApiError(409, "Restore this project before editing it.");
    await rateLimit(request, "workspace-save", user.id, 20);
    const input = z
      .object({
        files: z.unknown(),
        expected: expectedFilesSchema,
        description: z
          .string()
          .trim()
          .min(1)
          .max(160)
          .default("Edited source files"),
      })
      .strict()
      .parse(await body(request, 10 * 1024 * 1024));
    const files = sourceFiles(input.files);
    return Response.json(
      await saveFiles(
        projectId,
        user.id,
        files,
        input.expected,
        input.description,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
