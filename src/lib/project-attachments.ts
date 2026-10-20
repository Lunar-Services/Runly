import "server-only";
import { createHash } from "node:crypto";
import { adminClient, ApiError, readRawBody } from "./api";
import { workspaceFailure } from "./workspace-server";

export const attachmentBucket = "project-attachments";
export const maxAttachmentCount = 5;
export const maxAttachmentBytes = 8 * 1024 * 1024;
export const maxAttachmentTotalBytes = 20 * 1024 * 1024;
export const maxMultipartBytes = maxAttachmentTotalBytes + 1024 * 1024;
export const allowedAttachmentTypes = new Set([
  "application/json",
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export function safeAttachmentName(name: string) {
  return (
    name
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^\.+/, "")
      .slice(-120) || "attachment"
  );
}
export function validateAttachments(files: File[]) {
  if (!files.length || files.length > maxAttachmentCount)
    throw new ApiError(400, "Choose between one and five files.");
  if (files.some((file) => file.size < 1 || file.size > maxAttachmentBytes))
    throw new ApiError(
      400,
      "Each attachment must be between 1 byte and 8 MiB.",
    );
  if (files.reduce((sum, file) => sum + file.size, 0) > maxAttachmentTotalBytes)
    throw new ApiError(413, "Keep the total attachment size under 20 MiB.");
  if (files.some((file) => !allowedAttachmentTypes.has(file.type)))
    throw new ApiError(
      415,
      "Use images, videos, PDFs, or text and data files.",
    );
}
export async function attachmentForm(request: Request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.startsWith("multipart/form-data"))
    throw new ApiError(415, "Upload attachments as form data.");
  const raw = await readRawBody(request, maxMultipartBytes);
  const form = await new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": contentType },
    body: raw,
  }).formData();
  const values = form.getAll("files");
  if (values.some((file) => !(file instanceof File)))
    throw new ApiError(400, "Choose valid attachment files.");
  const files = values as File[];
  validateAttachments(files);
  return { form, files };
}
export function attachmentStoragePath(
  project: string,
  owner: string,
  requestId: string,
  ordinal: number,
  name: string,
) {
  const hex = createHash("sha256")
    .update(`${project}:${requestId}:${ordinal}`)
    .digest("hex");
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return { id, path: `${owner}/${project}/${id}-${safeAttachmentName(name)}` };
}
export async function attachmentManifest(
  project: string,
  owner: string,
  requestId: string,
  files: File[],
) {
  validateAttachments(files);
  return Promise.all(
    files.map(async (file, ordinal) => {
      const bytes = Buffer.from(await file.arrayBuffer());
      const { id, path } = attachmentStoragePath(
        project,
        owner,
        requestId,
        ordinal,
        file.name,
      );
      return {
        id,
        ordinal,
        name:
          file.name.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 200) ||
          "attachment",
        storage_path: path,
        size: bytes.length,
        content_type: file.type,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes,
      };
    }),
  );
}

export type AttachmentRecord = {
  id: string;
  ordinal: number;
  name: string;
  storage_path: string;
  size: number;
  content_type: string;
  sha256: string;
  status: "pending" | "ready";
  created_at: string;
};
export async function signedAttachments(
  records: AttachmentRecord[],
  expirySeconds = 15 * 60,
) {
  if (!records.length) return [];
  const { data, error } = await adminClient()
    .storage.from(attachmentBucket)
    .createSignedUrls(
      records.map((file) => file.storage_path),
      expirySeconds,
    );
  if (error || !data || data.some((file) => file.error || !file.signedUrl))
    throw new ApiError(
      502,
      "Your files were saved but download links couldn't be prepared. Refresh the attachment list.",
    );
  return records.map((file, index) => ({
    id: file.id,
    name: file.name,
    size: file.size,
    contentType: file.content_type,
    createdAt: file.created_at,
    url: data[index].signedUrl,
  }));
}
export async function uploadProjectAttachments(
  project: string,
  actor: string,
  owner: string,
  requestId: string,
  files: File[],
  expirySeconds = 15 * 60,
) {
  const manifest = await attachmentManifest(project, owner, requestId, files);
  const db = adminClient();
  const { data, error } = await db.rpc("reserve_project_attachments", {
    p_project: project,
    p_actor: actor,
    p_request: requestId,
    p_files: manifest.map((file) => ({
      id: file.id,
      ordinal: file.ordinal,
      name: file.name,
      storage_path: file.storage_path,
      size: file.size,
      content_type: file.content_type,
      sha256: file.sha256,
    })),
  });
  if (error) {
    if (error.message.includes("attachment_limit"))
      throw new ApiError(
        409,
        "This project has reached its limit of 100 attached files.",
      );
    if (error.message.includes("attachment_pending"))
      throw new ApiError(
        409,
        "This upload is still in progress. Please retry shortly.",
      );
    workspaceFailure(error.message);
  }
  const reservation = data as {
    created: boolean;
    attachments: AttachmentRecord[];
  };
  if (!reservation.created)
    return {
      attachments: await signedAttachments(
        reservation.attachments,
        expirySeconds,
      ),
      storagePaths: reservation.attachments.map((file) => file.storage_path),
    };
  const storage = db.storage.from(attachmentBucket);
  try {
    for (const file of manifest) {
      const { error: uploadError } = await storage.upload(
        file.storage_path,
        file.bytes,
        {
          contentType: file.content_type,
          cacheControl: "3600",
          upsert: false,
        },
      );
      if (uploadError) {
        // A retry may take over an interrupted batch. Existing immutable bytes
        // are reusable only when they match the reserved content digest.
        const { data: existing, error: downloadError } = await storage.download(
          file.storage_path,
        );
        if (
          downloadError ||
          !existing ||
          createHash("sha256")
            .update(Buffer.from(await existing.arrayBuffer()))
            .digest("hex") !== file.sha256
        )
          throw new ApiError(
            502,
            "Couldn't upload the selected files. Please retry.",
          );
      }
    }
    const { error: finishError } = await db.rpc("finish_project_attachments", {
      p_project: project,
      p_actor: actor,
      p_request: requestId,
      p_ready: true,
    });
    if (finishError) workspaceFailure(finishError.message);
  } catch (uploadError) {
    const { error: cleanupError } = await storage.remove(
      manifest.map((file) => file.storage_path),
    );
    if (!cleanupError) {
      const { error: releaseError } = await db.rpc(
        "finish_project_attachments",
        {
          p_project: project,
          p_actor: actor,
          p_request: requestId,
          p_ready: false,
        },
      );
      if (releaseError)
        console.error(
          "Attachment reservation cleanup failed",
          releaseError.code,
        );
    } else console.error("Attachment object cleanup failed", cleanupError.name);
    throw uploadError;
  }
  return {
    attachments: await signedAttachments(
      reservation.attachments,
      expirySeconds,
    ),
    storagePaths: reservation.attachments.map((file) => file.storage_path),
  };
}
