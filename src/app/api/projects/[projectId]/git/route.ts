import { z } from "zod";
import {
  adminClient,
  ApiError,
  body,
  failure,
  rateLimit,
  sameOrigin,
} from "@/lib/api";
import { installationRepositories, linkedGithubUserId } from "@/lib/github";
import { brokerGit } from "@/lib/github-broker";
import { enqueueRuntime, runtimeAccess } from "@/lib/runtime/server";

type Context = { params: Promise<{ projectId: string }> };
const branchName = z
  .string()
  .min(1)
  .max(100)
  .regex(
    /^(?!-)(?!.*(?:\.\.|@\{|\/\/|\.lock(?:\/|$)))[A-Za-z0-9_][A-Za-z0-9_./-]*$/,
  );
const inputSchema = z.object({
  action: z.enum(["link", "status", "branch", "checkout", "pull", "push"]),
  repositoryId: z.number().int().positive().optional(),
  installationId: z.number().int().positive().optional(),
  branch: branchName.optional(),
  message: z.string().trim().min(1).max(120).optional(),
});

async function projectAccess(projectId: string) {
  const { db, user } = await runtimeAccess(projectId);
  const { data: project, error } = await db
    .from("projects")
    .select(
      "id,owner_id,github_repo_id,github_branch,github_installation_id,github_commit_sha",
    )
    .eq("id", projectId)
    .single();
  if (error || !project) throw new ApiError(404, "Project not found.");
  if (project.owner_id !== user.id)
    throw new ApiError(
      403,
      "Only the project owner can manage its repository.",
    );
  if (!(await linkedGithubUserId(db)))
    throw new ApiError(403, "Link GitHub in Account settings first.");
  return { user, project };
}

async function readyWorkspace(projectId: string, userId: string) {
  const db = adminClient();
  const { data: current } = await db
    .from("project_runtimes")
    .select("state")
    .eq("project_id", projectId)
    .maybeSingle();
  if (!current || current.state === "stopped" || current.state === "error")
    await enqueueRuntime(projectId, userId, "start", crypto.randomUUID());
  for (let i = 0; i < 90; i++) {
    const { data, error } = await db
      .from("project_runtimes")
      .select("state,error")
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) throw new ApiError(503, "Couldn't check workspace state.");
    if (data?.state === "ready") return;
    if (data?.state === "error")
      throw new ApiError(503, data.error || "Workspace failed to start.");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new ApiError(
    503,
    "Workspace is still starting. Retry the Git action shortly.",
  );
}

export async function GET(_request: Request, context: Context) {
  try {
    const { projectId } = await context.params;
    const { project } = await projectAccess(projectId);
    return Response.json(
      {
        repositoryId: project.github_repo_id,
        installationId: project.github_installation_id,
        branch: project.github_branch,
      },
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
    const { user, project } = await projectAccess(projectId);
    await rateLimit(request, "project-git", user.id, 15);
    const parsed = inputSchema.safeParse(await body(request, 2048));
    if (!parsed.success)
      throw new ApiError(400, "Check the repository action and try again.");
    const input = parsed.data;
    const installationId =
      input.action === "link"
        ? input.installationId
        : project.github_installation_id;
    const repositoryId =
      input.action === "link" ? input.repositoryId : project.github_repo_id;
    if (!installationId || !repositoryId)
      throw new ApiError(400, "Select a GitHub repository first.");
    if (
      input.action === "link" &&
      project.github_repo_id &&
      project.github_repo_id !== repositoryId
    )
      throw new ApiError(
        409,
        "This project is already connected to a different repository.",
      );
    const { data: connection, error: connectionError } = await adminClient()
      .from("github_connections")
      .select("installation_id")
      .eq("user_id", user.id)
      .eq("installation_id", installationId)
      .maybeSingle();
    if (connectionError || !connection)
      throw new ApiError(
        403,
        "Install the Runly GitHub App on your linked account first.",
      );
    const repository = (await installationRepositories(installationId)).find(
      (item) => item.id === repositoryId,
    );
    if (!repository || repository.archived)
      throw new ApiError(
        403,
        "The repository is unavailable to this GitHub installation.",
      );
    const branch =
      input.action === "link"
        ? repository.default_branch
        : input.action === "branch" || input.action === "checkout"
          ? input.branch
          : project.github_branch;
    if (!branch || !branchName.safeParse(branch).success)
      throw new ApiError(400, "Invalid repository branch.");
    if (input.action === "push" && !input.message)
      throw new ApiError(400, "Enter a commit message.");
    await readyWorkspace(projectId, user.id);
    const result = await brokerGit({
      project,
      user: user.id,
      repository,
      installationId,
      action: input.action,
      branch,
      author:
        user.user_metadata?.full_name ||
        user.email?.split("@")[0] ||
        "Runly user",
      email: user.email!,
      message: input.message,
    });
    if (input.action !== "status") {
      const { error } = await adminClient()
        .from("projects")
        .update({
          github_repo_id: repositoryId,
          github_installation_id: installationId,
          github_branch: result.branch || branch,
          github_commit_sha: result.commit || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", projectId)
        .eq("owner_id", user.id);
      if (error)
        throw new ApiError(
          502,
          "Git completed but project metadata could not be saved. Reload before retrying.",
        );
    }
    return Response.json(
      { ...result, repository: repository.full_name },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
