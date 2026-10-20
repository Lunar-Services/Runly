import { z } from "zod";
import {
  adminClient,
  ApiError,
  failure,
  rateLimit,
  sameOrigin,
} from "@/lib/api";
import { workspaceAccess } from "@/lib/workspace-server";
import {
  attachmentForm,
  uploadProjectAttachments,
  signedAttachments,
  type AttachmentRecord,
} from "@/lib/project-attachments";

// Attachment bytes stay private in Storage. Regenerate short-lived URLs instead
// of relying on the original AI brief's expiring download links.
export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await context.params;
    const { user, project } = await workspaceAccess(projectId);
    await rateLimit(request, "project-attachments", user.id, 30);
    const storage = adminClient().storage.from("project-attachments");
    const prefix = `${project.owner_id}/${projectId}`;
    const { data, error } = await storage.list(prefix, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error) throw new ApiError(502, "Couldn't load attached project files.");
    const { data: metadata, error: metadataError } = await adminClient()
      .from("project_attachments")
      .select(
        "id,ordinal,name,storage_path,size,content_type,sha256,status,created_at",
      )
      .eq("project_id", projectId)
      .limit(100);
    if (metadataError)
      throw new ApiError(502, "Couldn't load attachment metadata.");
    const records = (metadata || []) as AttachmentRecord[];
    const tracked = new Set(records.map((file) => file.storage_path));
    const ready = records.filter((file) => file.status === "ready");
    // Existing project-creation uploads predate attachment metadata. Keep those
    // objects available while excluding partially uploaded reserved batches.
    for (const file of data || []) {
      const path = `${prefix}/${file.name}`;
      if (
        !file.id ||
        !/^[a-f0-9-]{36}-[A-Za-z0-9._-]+$/.test(file.name) ||
        tracked.has(path)
      )
        continue;
      ready.push({
        id: file.id,
        ordinal: 0,
        name: file.name.slice(37),
        storage_path: path,
        size: Number(file.metadata?.size || 0),
        content_type: String(
          file.metadata?.mimetype || "application/octet-stream",
        ),
        sha256: "",
        status: "ready",
        created_at: file.created_at || file.updated_at || "",
      });
    }
    ready.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return Response.json(
      { attachments: await signedAttachments(ready) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    sameOrigin(request);
    const { projectId } = await context.params;
    const { user, project } = await workspaceAccess(projectId);
    if (project.status === "archived")
      throw new ApiError(409, "Restore this project before attaching files.");
    await rateLimit(request, "project-attachment-upload", user.id, 10);
    const { form, files } = await attachmentForm(request);
    const requestId = z.string().uuid().safeParse(form.get("requestId"));
    if (!requestId.success)
      throw new ApiError(400, "Include a valid upload request ID.");
    const { attachments } = await uploadProjectAttachments(
      projectId,
      user.id,
      project.owner_id,
      requestId.data,
      files,
    );
    return Response.json(
      { attachments },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
