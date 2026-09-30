"use client";

import { useRef, useState, useEffect } from "react";
import Link from "next/link";
import { Attachment01Icon } from "@hugeicons/core-free-icons";
import PromptBar from "./react-bits/PromptBar";

import { uploadMedia } from "@/lib/chat-media-client";
import { type MediaRef } from "@/lib/chat-media";

type Props = {
  projectId: string;
  chatId: string | null;
  sending: boolean;
  working: boolean;
  onSend: (text: string, media?: MediaRef[]) => Promise<boolean>;
  onStop: () => Promise<void>;
  onError: (message: string) => void;
};

const sources = [
  {
    key: "files",
    name: "Text files",
    description: "Add code, notes, or a project brief",
    icon: Attachment01Icon,
    attach: true,
  },
];

export function ChatPromptBar({
  projectId,
  chatId,
  sending,
  working,
  onSend,
  onStop,
  onError,
}: Props) {
  const files = useRef(new Map<string, string>());
  const media = useRef(new Map<string, MediaRef>());
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current) {
        recorder.current.onstop = null;
        if (recorder.current.state !== "inactive") recorder.current.stop();
        recorder.current.stream.getTracks().forEach((t) => t.stop());
      }
    },
    [],
  );
  async function upload(file: File) {
    if (media.current.size >= 4)
      throw new Error("Attach up to four media files per message.");
    setUploading(true);
    try {
      const ref = await uploadMedia(projectId, file);
      const name = `${file.name} · ${ref.id.slice(0, 4)}`;
      media.current.set(name, ref);
      return name;
    } finally {
      setUploading(false);
    }
  }
  async function attachMedia(): Promise<string[]> {
    return new Promise((resolve) => {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.multiple = true;
      picker.accept =
        "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,audio/mpeg,audio/mp4,audio/wav,audio/webm,audio/ogg";
      picker.oncancel = () => resolve([]);
      picker.onchange = async () => {
        const names: string[] = [];
        try {
          for (const file of Array.from(picker.files || []))
            names.push(await upload(file));
        } catch (e) {
          onError(e instanceof Error ? e.message : "Couldn't upload media.");
        }
        resolve(names);
      };
      picker.click();
    });
  }
  async function record(): Promise<string[]> {
    if (recorder.current) {
      recorder.current.stop();
      return [];
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      onError("Voice recording isn't available in this browser.");
      return [];
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      return await new Promise((resolve) => {
        const mime = ["audio/webm", "audio/mp4"].find((t) =>
          MediaRecorder.isTypeSupported(t),
        );
        const value = new MediaRecorder(
          stream,
          mime ? { mimeType: mime } : undefined,
        );
        recorder.current = value;
        const chunks: Blob[] = [];
        value.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        value.onstop = async () => {
          if (timer.current) clearTimeout(timer.current);
          recorder.current = null;
          stream.getTracks().forEach((t) => t.stop());
          setRecording(false);
          try {
            resolve([
              await upload(
                new File(
                  chunks,
                  `Voice message.${value.mimeType.includes("mp4") ? "m4a" : "webm"}`,
                  { type: value.mimeType.split(";")[0] },
                ),
              ),
            ]);
          } catch (e) {
            onError(
              e instanceof Error ? e.message : "Couldn't save this recording.",
            );
            resolve([]);
          }
        };
        value.onerror = () => {
          onError("Voice recording failed.");
          value.stop();
        };
        value.start();
        setRecording(true);
        timer.current = setTimeout(() => {
          if (value.state === "recording") value.stop();
        }, 90000);
      });
    } catch (e) {
      onError(
        e instanceof Error ? e.message : "Microphone access is unavailable.",
      );
      return [];
    }
  }
  async function attach(): Promise<string[]> {
    return new Promise((resolve) => {
      const picker = document.createElement("input");
      picker.type = "file";
      picker.multiple = true;
      picker.accept =
        ".txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.html,.css,.py,.yaml,.yml";
      picker.oncancel = () => resolve([]);
      picker.onchange = async () => {
        const names: string[] = [];
        try {
          for (const file of Array.from(picker.files || [])) {
            if (file.size > 8_000)
              throw new Error("Choose text files smaller than 8 KB.");
            const content = await file.text();
            if (content.includes("\u0000"))
              throw new Error("Only text and code files can be attached here.");
            files.current.set(file.name, content);
            names.push(file.name);
          }
          resolve(names);
        } catch (reason) {
          onError(
            reason instanceof Error
              ? reason.message
              : "Couldn't read the file.",
          );
          resolve([]);
        }
      };
      picker.click();
    });
  }

  return (
    <div className="runly-chat-composer">
      <PromptBar
        key={chatId}
        onMedia={attachMedia}
        onRecord={record}
        recording={recording}
        mediaBusy={uploading}
        onRemoveAttachment={(name: string) => {
          files.current.delete(name);
          media.current.delete(name);
        }}
        width={860}
        placeholder="Ask Runly to build, plan, or explore…"
        sources={sources}
        models={[]}
        efforts={[]}
        background="var(--surface-card)"
        color="var(--text-main)"
        menuBackground="var(--surface-raised)"
        sparkColor="var(--text-secondary)"
        sparkBoost={0.25}
        busy={sending || working}
        onAttach={attach}
        onStop={working && !sending ? onStop : undefined}
        onSend={async (text: string, meta: { attachments: string[] }) => {
          const context = meta.attachments
            .filter((name) => files.current.has(name))
            .map(
              (name) =>
                `\n\nAttached file: ${name}\n${files.current.get(name) || ""}`,
            )
            .join("");
          const message = text + context;
          if (
            message.length > 12_000 ||
            new TextEncoder().encode(JSON.stringify(message)).length > 15_000
          ) {
            onError(
              "Your message and attached files are too long. Keep them under 12,000 characters and 15 KB combined.",
            );
            return false;
          }
          if (uploading || recording) {
            onError("Finish recording or uploading before sending.");
            return false;
          }
          const refs = meta.attachments.flatMap((name) =>
            media.current.has(name) ? [media.current.get(name)!] : [],
          );
          const accepted = await onSend(
            message || "Review the attached media.",
            refs,
          );
          if (accepted)
            for (const name of meta.attachments) {
              files.current.delete(name);
              media.current.delete(name);
            }
          return accepted;
        }}
      />
      <div className="runly-composer-meta">
        <span>
          {sending
            ? "Sending…"
            : working
              ? "Working on your project"
              : "Enter to send · Shift + Enter for a new line"}
        </span>
        <Link href="/dashboard">Usage & plan</Link>
      </div>
    </div>
  );
}
