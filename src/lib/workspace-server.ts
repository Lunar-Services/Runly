import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { adminClient, ApiError } from "./api";
import { runtimeAccess } from "./runtime/server";
import { internalFiles, type SourceFile } from "./runtime/internal-files";
import { validWorkspacePath } from "./runtime/shared";

export const workspaceFileSchema = z
  .object({
    path: z
      .string()
      .refine(validWorkspacePath, "Choose a safe project file path."),
    kind: z.enum(["file", "folder"]),
    content: z.string().max(1_048_576),
    hash: z.string().max(64).optional(),
  })
  .strict();
export const expectedFilesSchema = z
  .array(
    z.object({
      path: z.string().refine(validWorkspacePath),
      kind: z.enum(["file", "folder"]),
      hash: z.string().max(64),
    }),
  )
  .max(1000);

export function sourceFiles(input: unknown): SourceFile[] {
  const parsed = z.array(workspaceFileSchema).max(1000).safeParse(input);
  if (!parsed.success)
    throw new ApiError(400, "Check the project files and their paths.");
  const files = parsed.data
    .map((file) => ({
      ...file,
      content: file.kind === "folder" ? "" : file.content,
      hash:
        file.kind === "folder"
          ? ""
          : createHash("sha256").update(file.content, "utf8").digest("hex"),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(files.map((file) => file.path)).size !== files.length)
    throw new ApiError(400, "Each project file needs a unique path.");
  const paths = new Map(files.map((file) => [file.path, file.kind]));
  for (const file of files) {
    if (Buffer.byteLength(file.content, "utf8") > 1_048_576)
      throw new ApiError(413, "Keep each source file under 1 MiB.");
    const parts = file.path.split("/");
    for (let i = 1; i < parts.length; i++)
      if (paths.get(parts.slice(0, i).join("/")) === "file")
        throw new ApiError(400, "A file cannot contain another file.");
  }
  if (
    files.reduce(
      (sum, file) => sum + Buffer.byteLength(file.content, "utf8"),
      0,
    ) >
    8 * 1024 * 1024
  )
    throw new ApiError(413, "Keep project source files under 8 MiB in total.");
  return files;
}

export async function workspaceAccess(projectId: string, ownerOnly = false) {
  const access = await runtimeAccess(projectId);
  const { data: project, error } = await access.db
    .from("projects")
    .select("id,name,status,owner_id,created_at,updated_at")
    .eq("id", projectId)
    .single();
  if (error || !project) throw new ApiError(404, "Project not found.");
  if (ownerOnly && project.owner_id !== access.user.id)
    throw new ApiError(403, "Only the project owner can do that.");
  return { ...access, project };
}

export async function savedFiles(projectId: string): Promise<SourceFile[]> {
  const { data, error } = await adminClient()
    .from("runtime_files")
    .select("path,kind,content,hash")
    .eq("project_id", projectId)
    .order("path")
    .limit(1000);
  if (error) throw new ApiError(502, "Couldn't load project files.");
  return (data || []).filter((file) =>
    validWorkspacePath(file.path),
  ) as SourceFile[];
}

export function workspaceFailure(message: string): never {
  const known: [string, number, string][] = [
    [
      "files_conflict",
      409,
      "Project files changed. Refresh before saving again.",
    ],
    [
      "workspace_conflict",
      409,
      "Project files changed. Refresh before saving again.",
    ],
    [
      "workspace_busy",
      409,
      "Wait for the workspace to stop before changing its saved files.",
    ],
    [
      "workspace_runtime_busy",
      409,
      "Wait for the workspace to stop before changing its saved files.",
    ],
    [
      "project_archived",
      409,
      "Restore this archived project before editing it.",
    ],
    [
      "not_authorized",
      403,
      "You don't have permission to change this project.",
    ],
    ["project_missing", 404, "Project not found."],
    ["chat_missing", 404, "Chat not found in this project."],
    [
      "chat_busy",
      409,
      "Wait for this chat's queued or running work to finish before deleting it.",
    ],
    [
      "project_cap_reached",
      409,
      "Your subscription's project limit has been reached. Archive a project or change your plan.",
    ],
    [
      "idempotency_conflict",
      409,
      "This request was already used for a different message. Send it again with a new request ID.",
    ],
  ];
  const match = known.find(([code]) => message.includes(code));
  throw new ApiError(
    match?.[1] || 502,
    match?.[2] || "Couldn't save this project. Please retry.",
  );
}

export async function snapshotVersion(
  projectId: string,
  actor: string,
  description: string,
) {
  const { data, error } = await adminClient().rpc(
    "snapshot_workspace_version",
    {
      p_project: projectId,
      p_actor: actor,
      p_description: description,
    },
  );
  if (error) workspaceFailure(error.message);
  return data as string;
}

export async function saveFiles(
  projectId: string,
  actor: string,
  files: SourceFile[],
  expected: z.infer<typeof expectedFilesSchema>,
  description: string,
) {
  const { data: current, error } = await adminClient()
    .from("project_runtimes")
    .select("state")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new ApiError(502, "Couldn't check the workspace state.");
  let versionId: string;
  if (current?.state === "ready") {
    await internalFiles({
      project: projectId,
      user: actor,
      action: "replace",
      files,
      expected: expected.map((file) => ({ ...file, content: "" })),
    });
    versionId = await snapshotVersion(projectId, actor, description);
  } else {
    const { data, error: saveError } = await adminClient().rpc(
      "commit_workspace_files",
      {
        p_project: projectId,
        p_actor: actor,
        p_expected: expected,
        p_files: files,
        p_description: description,
      },
    );
    if (saveError) workspaceFailure(saveError.message);
    versionId = data as string;
  }
  return { files: await savedFiles(projectId), versionId };
}

export async function recordWorkspaceAction(
  actor: string | null,
  project: string,
  action: string,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await adminClient().from("audit_events").insert({
    actor_id: actor,
    project_id: project,
    action,
    metadata,
  });
  if (error)
    throw new ApiError(
      502,
      "Couldn't record the project action. Please retry.",
    );
}
