import { z } from "zod";
import {
  adminClient,
  ApiError,
  body,
  failure,
  rateLimit,
  sameOrigin,
} from "@/lib/api";
import { runtimeAccess } from "@/lib/runtime/server";
import {
  MEDIA_BUCKET,
  mediaPath,
  mediaRefSchema,
  mediaManifestSchema,
} from "@/lib/chat-media";
const mimes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
  "audio/x-wav",
];
export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    sameOrigin(request);
    const { projectId } = await params;
    const { user } = await runtimeAccess(projectId);
    await rateLimit(request, "chat-media", user.id, 20);
    const parsed = z
      .discriminatedUnion("action", [
        z.object({
          action: z.literal("init"),
          name: z.string().min(1).max(180),
          mime: z.enum(mimes as [string, ...string[]]),
          size: z
            .number()
            .int()
            .positive()
            .max(20 * 1024 * 1024),
        }),
        z.object({
          action: z.literal("finish"),
          id: z.string().uuid(),
          frames: z.array(z.string().max(350000)).max(6).default([]),
        }),
      ])
      .safeParse(await body(request, 2200000));
    if (!parsed.success)
      throw new ApiError(
        400,
        "Choose supported media under 20 MB (images under 5 MB).",
      );
    const input = parsed.data;
    const db = adminClient();
    const bucket = db.storage.from(MEDIA_BUCKET);
    if (input.action === "init") {
      if (input.mime.startsWith("image/") && input.size > 5 * 1024 * 1024)
        throw new ApiError(400, "Choose images smaller than 5 MB.");
      const existing = await db.storage.getBucket(MEDIA_BUCKET);
      if (existing.error) {
        const created = await db.storage.createBucket(MEDIA_BUCKET, {
          public: false,
          fileSizeLimit: 20 * 1024 * 1024,
          allowedMimeTypes: [...mimes, "application/json"],
        });
        if (
          created.error &&
          created.error.message !== "The resource already exists"
        )
          throw new ApiError(503, "Media storage is unavailable.");
      } else if (existing.data.public)
        throw new ApiError(503, "Media storage must be private.");
      const ref = { id: crypto.randomUUID(), owner: user.id };
      const base = mediaPath(projectId, ref);
      const saved = await bucket.upload(
        base + "/manifest.json",
        JSON.stringify({
          name: input.name,
          mime: input.mime,
          size: input.size,
          ready: false,
          frames: [],
        }),
        { contentType: "application/json" },
      );
      if (saved.error) throw new ApiError(502, "Couldn't prepare this upload.");
      const signed = await bucket.createSignedUploadUrl(base + "/original");
      if (signed.error)
        throw new ApiError(502, "Couldn't prepare this upload.");
      return Response.json({
        ref,
        path: base + "/original",
        token: signed.data.token,
      });
    }
    const ref = { id: input.id, owner: user.id };
    const base = mediaPath(projectId, ref);
    const raw = await bucket.download(base + "/manifest.json");
    if (!raw.data) throw new ApiError(404, "Upload not found.");
    const manifest = mediaManifestSchema.parse(
      JSON.parse(await raw.data.text()),
    );
    if (manifest.ready) return Response.json({ ref, name: manifest.name });
    const original = await bucket.info(base + "/original");
    if (
      original.error ||
      original.data.size !== manifest.size ||
      original.data.contentType !== manifest.mime
    )
      throw new ApiError(400, "Upload is incomplete or has an invalid format.");
    const frames: string[] = [];
    for (const [i, frame] of input.frames.entries()) {
      if (
        !manifest.mime.startsWith("video/") ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(frame)
      )
        throw new ApiError(400, "Invalid video frame.");
      const path = base + `/frame-${i}.jpg`;
      const saved = await bucket.upload(
        path,
        Buffer.from(frame.split(",")[1], "base64"),
        { contentType: "image/jpeg", upsert: true },
      );
      if (saved.error)
        throw new ApiError(502, "Couldn't save the video preview.");
      frames.push(path);
    }
    if (manifest.mime.startsWith("video/") && !frames.length)
      throw new ApiError(
        400,
        "Couldn't read this video. Try an MP4 or WebM file.",
      );
    const saved = await bucket.update(
      base + "/manifest.json",
      JSON.stringify({ ...manifest, ready: true, frames }),
      { contentType: "application/json" },
    );
    if (saved.error) throw new ApiError(502, "Couldn't finish the upload.");
    return Response.json({ ref, name: manifest.name });
  } catch (error) {
    return failure(error);
  }
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    await runtimeAccess(projectId);
    const url = new URL(request.url);
    const ref = mediaRefSchema.parse({
      id: url.searchParams.get("id"),
      owner: url.searchParams.get("owner"),
    });
    const bucket = adminClient().storage.from(MEDIA_BUCKET);
    const base = mediaPath(projectId, ref);
    const raw = await bucket.download(base + "/manifest.json");
    if (!raw.data) throw new ApiError(404, "Media not found.");
    const manifest = mediaManifestSchema.parse(
      JSON.parse(await raw.data.text()),
    );
    if (!manifest.ready) throw new ApiError(404, "Media not ready.");
    const signed = await bucket.createSignedUrl(base + "/original", 300);
    if (!signed.data) throw new ApiError(502, "Couldn't load this media.");
    return Response.json(
      { ...manifest, url: signed.data.signedUrl },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
