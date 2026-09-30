import { adminClient, ApiError, failure, rateLimit, session } from "@/lib/api";
import { installationRepositories, linkedGithubUserId } from "@/lib/github";

export async function GET(request: Request) {
  try {
    const { db, user } = await session();
    await rateLimit(request, "github-repositories", user.id, 10);
    if (!(await linkedGithubUserId(db)))
      return Response.json(
        { linked: false, repositories: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    const { data: connections, error } = await adminClient()
      .from("github_connections")
      .select("installation_id,account_login")
      .eq("user_id", user.id);
    if (error) throw new ApiError(502, "Couldn't load GitHub installations.");
    const repositories = (
      await Promise.all(
        (connections || []).map(async (connection) =>
          (await installationRepositories(connection.installation_id)).map(
            (repository) => ({
              id: repository.id,
              fullName: repository.full_name,
              defaultBranch: repository.default_branch,
              private: repository.private,
              archived: repository.archived,
              installationId: connection.installation_id,
            }),
          ),
        ),
      )
    ).flat();
    return Response.json(
      { linked: true, repositories },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
