import { ApiError, failure } from "@/lib/api";
import { runtimeAccess } from "@/lib/runtime/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const { db } = await runtimeAccess(projectId);
    const { data, error } = await db.rpc("project_usage_summary", {
      p_project: projectId,
    });
    if (error)
      throw new ApiError(
        503,
        "Usage is unavailable. Apply the latest database migration.",
      );
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}
