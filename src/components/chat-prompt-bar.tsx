"use client";

import { useRef } from "react";
import { Attachment01Icon } from "@hugeicons/core-free-icons";
import PromptBar from "./react-bits/PromptBar";

type Props = {
  chatId: string | null;
  sending: boolean;
  working: boolean;
  onSend: (text: string) => Promise<boolean>;
  onStop: () => Promise<void>;
  onError: (message: string) => void;
  onUsage: () => void;
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
  chatId,
  sending,
  working,
  onSend,
  onStop,
  onError,
  onUsage,
}: Props) {
  const files = useRef(new Map<string, string>());
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
          const accepted = await onSend(message);
          if (accepted)
            for (const name of meta.attachments) files.current.delete(name);
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
        <button type="button" onClick={onUsage}>
          Usage &amp; plan
        </button>
      </div>
    </div>
  );
}
