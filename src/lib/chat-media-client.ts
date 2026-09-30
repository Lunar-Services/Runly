import { createBrowserSupabaseClient } from "./supabase/client";
import { MEDIA_BUCKET, type MediaRef } from "./chat-media";
async function frames(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Couldn't read this video."));
    });
    if (!Number.isFinite(video.duration) || video.duration > 120)
      throw new Error("Choose videos under two minutes.");
    const canvas = document.createElement("canvas");
    canvas.width = Math.min(960, video.videoWidth);
    canvas.height = Math.round(
      (video.videoHeight * canvas.width) / video.videoWidth,
    );
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Video previews are unavailable.");
    const result: string[] = [];
    for (let i = 0; i < 6; i++) {
      await new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("Couldn't read this video."));
        video.currentTime = Math.max(
          0.001,
          Math.min(video.duration - 0.01, ((i + 0.1) / 6) * video.duration),
        );
      });
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      result.push(canvas.toDataURL("image/jpeg", 0.7));
    }
    return result;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
async function validateAudio(file: File) {
  const url = URL.createObjectURL(file);
  const audio = document.createElement("audio");
  audio.preload = "metadata";
  audio.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Couldn't read this audio file.")),
        10000,
      );
      audio.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve();
      };
      audio.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Couldn't read this audio file."));
      };
    });
    if (Number.isFinite(audio.duration) && audio.duration > 120)
      throw new Error("Choose audio under two minutes.");
  } finally {
    audio.removeAttribute("src");
    audio.load();
    URL.revokeObjectURL(url);
  }
}
export async function uploadMedia(
  project: string,
  file: File,
): Promise<MediaRef> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Choose media smaller than 20 MB.");
  const db = createBrowserSupabaseClient();
  if (!db) throw new Error("Media uploads are unavailable.");
  const call = async (value: unknown) => {
    const response = await fetch(`/api/projects/${project}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Couldn't upload media.");
    return data;
  };
  if (file.type.startsWith("audio/")) await validateAudio(file);
  const previews = file.type.startsWith("video/") ? await frames(file) : [];
  const upload = await call({
    action: "init",
    name: file.name,
    mime: file.type,
    size: file.size,
  });
  const saved = await db.storage
    .from(MEDIA_BUCKET)
    .uploadToSignedUrl(upload.path, upload.token, file, {
      contentType: file.type,
    });
  if (saved.error) throw new Error("Couldn't upload this media. Try again.");
  await call({ action: "finish", id: upload.ref.id, frames: previews });
  return upload.ref;
}
