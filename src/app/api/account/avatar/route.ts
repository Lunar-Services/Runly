import { adminClient, ApiError, failure, sameOrigin, session } from "@/lib/api";
import { randomUUID } from "node:crypto";

const maxAvatarBytes = 5 * 1024 * 1024;
const imageSignatures = {
  "image/jpeg": (bytes: Uint8Array) =>
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff,
  "image/png": (bytes: Uint8Array) =>
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    ),
  "image/webp": (bytes: Uint8Array) =>
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
} as const;

function extensionFor(type: keyof typeof imageSignatures) {
  return type === "image/jpeg" ? "jpg" : type.slice("image/".length);
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
      throw new ApiError(415, "Upload an image file.");
    const { user } = await session();
    const admin = adminClient();
    const form = await request.formData();
    const file = form.get("avatar");
    if (!(file instanceof File))
      throw new ApiError(400, "Choose a profile image to upload.");
    if (file.size < 1 || file.size > maxAvatarBytes)
      throw new ApiError(
        400,
        "Profile images must be between 1 byte and 5 MB.",
      );
    if (!(file.type in imageSignatures))
      throw new ApiError(400, "Use a JPEG, PNG, or WebP image.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const type = file.type as keyof typeof imageSignatures;
    if (!imageSignatures[type](bytes))
      throw new ApiError(
        400,
        "The uploaded file does not match its image type.",
      );
    // Every upload receives a new object key. Reusing a path can leave clients
    // showing a stale Storage/CDN response after an avatar is replaced.
    const path = `${user.id}/avatar.${randomUUID()}.${extensionFor(type)}`;
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("avatar_path,avatar_url")
      .eq("id", user.id)
      .single();
    if (profileError) throw new ApiError(502, "Couldn't load your profile.");
    const { error: uploadError } = await admin.storage
      .from("profile-avatars")
      .upload(path, bytes, {
        upsert: true,
        contentType: type,
        cacheControl: "3600",
      });
    if (uploadError)
      throw new ApiError(502, "Couldn't upload your profile image. Try again.");
    const { error: updateError } = await admin
      .from("profiles")
      .update({
        avatar_path: path,
        avatar_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (updateError)
      throw new ApiError(502, "Couldn't save your profile image. Try again.");
    if (profile.avatar_path && profile.avatar_path !== path)
      await admin.storage.from("profile-avatars").remove([profile.avatar_path]);
    const { data: signed, error: signedError } = await admin.storage
      .from("profile-avatars")
      .createSignedUrl(path, 60 * 60);
    if (signedError)
      throw new ApiError(
        502,
        "Your image was saved but could not be displayed. Refresh and try again.",
      );
    return Response.json({ avatarUrl: signed.signedUrl });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    sameOrigin(request);
    const { user } = await session();
    const admin = adminClient();
    const { data: profile, error } = await admin
      .from("profiles")
      .select("avatar_path")
      .eq("id", user.id)
      .single();
    if (error) throw new ApiError(502, "Couldn't load your profile.");
    const { error: updateError } = await admin
      .from("profiles")
      .update({
        avatar_path: null,
        avatar_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    if (updateError)
      throw new ApiError(502, "Couldn't remove your profile image. Try again.");
    if (profile.avatar_path)
      await admin.storage.from("profile-avatars").remove([profile.avatar_path]);
    return Response.json({ avatarUrl: "" });
  } catch (error) {
    return failure(error);
  }
}
