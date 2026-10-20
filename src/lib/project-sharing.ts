import "server-only";
import { randomBytes } from "node:crypto";
import { adminClient, ApiError, appOrigin } from "./api";
import {
  recordWorkspaceAction,
  snapshotVersion,
  sourceFiles,
} from "./workspace-server";

export async function publishSnapshot(
  request: Request,
  projectId: string,
  actor: string,
  action: "project.shared" | "project.published",
) {
  const versionId = await snapshotVersion(
    projectId,
    actor,
    action === "project.published"
      ? "Published static site"
      : "Shared source snapshot",
  );
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: share, error } = await adminClient()
    .from("project_shares")
    .upsert(
      {
        project_id: projectId,
        version_id: versionId,
        token,
        enabled: true,
        source_visible: action === "project.shared",
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    )
    .select("token,expires_at,source_visible")
    .single();
  if (error || !share) throw new ApiError(502, "Couldn't share this snapshot.");
  await recordWorkspaceAction(actor, projectId, action, {
    version_id: versionId,
  });
  return {
    enabled: true,
    versionId,
    expiresAt: share.expires_at,
    sourceVisible: share.source_visible,
    url: share.source_visible
      ? `${appOrigin(request)}/api/shared/${share.token}`
      : null,
    siteUrl: `${appOrigin(request)}/api/shared/${share.token}/site/`,
  };
}

export async function sharedSnapshot(token: string, requireSource = false) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new ApiError(404, "Shared project not found.");
  const { data: share, error } = await adminClient()
    .from("project_shares")
    .select("project_id,version_id,source_visible")
    .eq("token", token)
    .eq("enabled", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw new ApiError(502, "Couldn't load this shared project.");
  if (!share) throw new ApiError(404, "Shared project not found.");
  if (requireSource && !share.source_visible)
    throw new ApiError(404, "Shared source not found.");
  const [
    { data: project, error: projectError },
    { data: version, error: versionError },
  ] = await Promise.all([
    adminClient()
      .from("projects")
      .select("name,status")
      .eq("id", share.project_id)
      .maybeSingle(),
    adminClient()
      .from("project_versions")
      .select("id,description,created_at,files")
      .eq("id", share.version_id)
      .eq("project_id", share.project_id)
      .is("encrypted_manifest", null)
      .maybeSingle(),
  ]);
  if (projectError || versionError)
    throw new ApiError(502, "Couldn't load this shared project.");
  if (
    !project ||
    project.status === "archived" ||
    !version ||
    version.files === null
  )
    throw new ApiError(404, "Shared project not found.");
  return {
    name: project.name,
    version: { ...version, files: sourceFiles(version.files) },
  };
}
