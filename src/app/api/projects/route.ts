import { z } from "zod";
import {
  adminClient,
  ApiError,
  body,
  failure,
  rateLimit,
  readRawBody,
  sameOrigin,
  session,
} from "@/lib/api";
import { projectNameFromPrompt } from "@/lib/project-name";
import { enqueueRuntime } from "@/lib/runtime/server";

const attachmentBucket = "project-attachments";
const maxAttachmentCount = 5;
const maxAttachmentBytes = 8 * 1024 * 1024;
const maxAttachmentTotalBytes = 20 * 1024 * 1024;
const maxMultipartBytes = maxAttachmentTotalBytes + 1024 * 1024;
const allowedAttachmentTypes = new Set([
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

function projectInput(value: unknown) {
  return z
    .object({
      name: z.string().trim().min(1).max(160).optional(),
      prompt: z.string().trim().min(1).max(12_000).optional(),
    })
    .refine((input) => input.name || input.prompt)
    .safeParse(value);
}

function safeAttachmentName(name: string) {
  return (
    name
      .normalize("NFKC")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^\.+/, "")
      .slice(-120) || "attachment"
  );
}

export async function GET() {
  try {
    const { db, user } = await session();
    const { data, error } = await db
      .from("projects")
      .select("id,name,status,created_at,updated_at")
      .eq("owner_id", user.id)
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error)
      throw new ApiError(502, "Couldn't load your projects. Please retry.");
    return Response.json(
      { projects: data },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await session();
    await rateLimit(request, "project-create", user.id, 10);
    const contentType = request.headers.get("content-type") || "";
    let input;
    let files: File[] = [];
    if (contentType.startsWith("multipart/form-data")) {
      const raw = await readRawBody(request, maxMultipartBytes);
      const form = await new Request(request.url, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body: raw,
      }).formData();
      const fileValues = form.getAll("files");
      if (fileValues.length > maxAttachmentCount)
        throw new ApiError(400, "Add up to five files.");
      if (fileValues.some((value) => !(value instanceof File)))
        throw new ApiError(400, "Choose valid files to upload.");
      files = fileValues as File[];
      const totalBytes = files.reduce((total, file) => total + file.size, 0);
      if (files.some((file) => file.size < 1 || file.size > maxAttachmentBytes))
        throw new ApiError(400, "Each file must be between 1 byte and 8 MB.");
      if (totalBytes > maxAttachmentTotalBytes)
        throw new ApiError(413, "Keep the total upload size under 20 MB.");
      if (files.some((file) => !allowedAttachmentTypes.has(file.type)))
        throw new ApiError(
          415,
          "Use images, videos, PDFs, or text and data files.",
        );
      const prompt = form.get("prompt");
      const name = form.get("name");
      input = projectInput({
        prompt: typeof prompt === "string" ? prompt : undefined,
        name: typeof name === "string" ? name : undefined,
      });
    } else {
      input = projectInput(await body(request, 16_384));
    }
    if (!input.success)
      throw new ApiError(
        400,
        "Enter a project name or describe what you want to build.",
      );
    const prompt =
      input.data.prompt ||
      (files.length
        ? "Use the attached files as inspiration for a new project."
        : "");
    // The service role writes only the authenticated user's project. Browser
    // credentials cannot insert directly and bypass this route's admission.
    const now = new Date().toISOString();
    const project = {
      id: crypto.randomUUID(),
      name: input.data.name || projectNameFromPrompt(prompt),
      owner_id: user.id,
      status: "draft",
      created_at: now,
      updated_at: now,
    };
    const { error } = await adminClient().from("projects").insert(project);
    if (error) {
      console.error("Runly project creation failed", error.code);
      throw new ApiError(502, "Couldn't create the project. Please try again.");
    }
    const uploadedPaths: string[] = [];
    try {
      const fileReferences: string[] = [];
      for (const file of files) {
        const path = `${user.id}/${project.id}/${crypto.randomUUID()}-${safeAttachmentName(file.name)}`;
        const bytes = Buffer.from(await file.arrayBuffer());
        const { error: uploadError } = await adminClient()
          .storage.from(attachmentBucket)
          .upload(path, bytes, {
            contentType: file.type,
            cacheControl: "3600",
            upsert: false,
          });
        if (uploadError)
          throw new ApiError(
            502,
            `Couldn't upload ${file.name}. Please try again.`,
          );
        uploadedPaths.push(path);
        const { data: signed, error: signedError } = await adminClient()
          .storage.from(attachmentBucket)
          .createSignedUrl(path, 60 * 60);
        if (signedError)
          throw new ApiError(
            502,
            `Couldn't prepare ${file.name} for the project.`,
          );
        fileReferences.push(
          `- ${safeAttachmentName(file.name)}: ${signed.signedUrl}`,
        );
      }

      const agentInput = files.length
        ? `${prompt}\n\nThe user attached these reference files. Download or inspect them as needed:\n${fileReferences.join("\n")}`
        : prompt;
      let conversationId: string | null = null;
      if (agentInput) {
        conversationId = crypto.randomUUID();
        await enqueueRuntime(
          project.id,
          user.id,
          "agent",
          conversationId,
          conversationId,
          agentInput,
        );
      }
      return Response.json(
        {
          project: {
            id: project.id,
            name: project.name,
            status: project.status,
            created_at: project.created_at,
            updated_at: project.updated_at,
          },
          conversationId,
        },
        { status: 201 },
      );
    } catch (error) {
      if (uploadedPaths.length)
        await adminClient()
          .storage.from(attachmentBucket)
          .remove(uploadedPaths);
      await adminClient()
        .from("projects")
        .delete()
        .eq("id", project.id)
        .eq("owner_id", user.id);
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}
