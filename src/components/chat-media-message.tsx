"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { decodeMessage, type MediaRef } from "@/lib/chat-media";
function Attachment({
  projectId,
  media,
}: {
  projectId: string;
  media: MediaRef;
}) {
  const [value, setValue] = useState<{
    url: string;
    mime: string;
    name: string;
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/projects/${projectId}/media?id=${media.id}&owner=${media.owner}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.message);
        setValue(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [projectId, media.id, media.owner]);
  if (!value) return <span>{error || "Loading attachment…"}</span>;
  return (
    <figure className="chat-media-attachment">
      {value.mime.startsWith("image/") ? (
        <Image
          src={value.url}
          alt={value.name}
          width={480}
          height={320}
          unoptimized
        />
      ) : value.mime.startsWith("video/") ? (
        <video src={value.url} controls playsInline preload="metadata" />
      ) : (
        <audio src={value.url} controls preload="metadata" />
      )}
      <figcaption>{value.name}</figcaption>
    </figure>
  );
}
export function ChatMediaMessage({
  body,
  projectId,
}: {
  body: string;
  projectId: string;
}) {
  const value = decodeMessage(body);
  return (
    <>
      <p>{value.text}</p>
      {value.media.map((m) => (
        <Attachment key={m.id} projectId={projectId} media={m} />
      ))}
    </>
  );
}
