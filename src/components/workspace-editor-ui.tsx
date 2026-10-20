"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { X, Pause, Play } from "lucide-react";
import {
  workspaceCode,
  workspaceProjects,
  type WorkspaceProjectView,
} from "../lib/workspace-ui-fixtures";
import styles from "./workspace-editor-ui.module.css";

function Icon({ file }: { file: string }) {
  return (
    <img
      src={`/figma/workspace/editor/${file}.svg`}
      alt=""
      aria-hidden="true"
    />
  );
}
function Logo({ size = 24 }: { size?: number }) {
  return (
    <Image src="/figma/workspace/b9eb4.png" width={size} height={size} alt="" />
  );
}
type Version = {
  id: number;
  description: string;
  palette: boolean;
  mode: WorkspaceProjectView;
  drafts: Record<WorkspaceProjectView, string>;
  extraDrafts: Record<string, string>;
  activeFile: string;
};
const initialSnapshot = {
  mode: "website" as const,
  drafts: { ...workspaceCode },
  extraDrafts: {},
  activeFile: "app/page.tsx",
};

export function WorkspaceEditorUI({ projectId }: { projectId?: string }) {
  const [mode, setMode] = useState<WorkspaceProjectView>("website");
  const [sideTab, setSideTab] = useState("Chat");
  const [tab, setTab] = useState("Preview");
  const [device, setDevice] = useState("Desktop");
  const [zoom, setZoom] = useState("100%");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [palette, setPalette] = useState(false);
  const [versions, setVersions] = useState<Version[]>(() =>
    projectId
      ? []
      : [
          {
            id: 3,
            description: "Updated headline and selected work",
            palette: false,
            ...initialSnapshot,
          },
          {
            id: 2,
            description: "Refined studio sections",
            palette: false,
            ...initialSnapshot,
          },
          {
            id: 1,
            description: "Created homepage",
            palette: false,
            ...initialSnapshot,
          },
        ],
  );
  const [version, setVersion] = useState(projectId ? 0 : 3);
  const [drafts, setDrafts] = useState(() =>
    projectId ? { website: "", app: "", video: "" } : { ...workspaceCode },
  );
  const [activeFile, setActiveFile] = useState(
    projectId ? "index.html" : "app/page.tsx",
  );
  const [extraDrafts, setExtraDrafts] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [remoteFiles, setRemoteFiles] = useState<
    Array<{ path: string; kind: string; content: string; hash: string }>
  >([]);
  const [projectFilesStatus, setProjectFilesStatus] = useState<
    "loading" | "ready" | "error"
  >(projectId ? "loading" : "ready");
  const [remoteVersions, setRemoteVersions] = useState<
    Array<{ id: string; description: string; created_at: string }>
  >([]);
  const [savedAttachments, setSavedAttachments] = useState<
    Array<{ id: string; name: string; size: number; url: string }>
  >([]);
  const [shareUrl, setShareUrl] = useState("");
  const [shareEnabled, setShareEnabled] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState("");
  const [chatId, setChatId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [userName, setUserName] = useState("");
  const [busy, setBusy] = useState(false);
  const [liveUnavailable, setLiveUnavailable] = useState(false);
  const [generationNotice, setGenerationNotice] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"share" | "publish" | "work" | null>(
    null,
  );
  const [playing, setPlaying] = useState(false);
  const [light, setLight] = useState(false);
  const [habits, setHabits] = useState([true, true, false]);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const pendingMessage = useRef<{ key: string; id: string } | null>(null);
  const messageLock = useRef(false);
  const current = workspaceProjects.find((item) => item.view === mode)!;
  const selectedVersion =
    versions.find((item) => item.id === version) || versions[0];
  const fixtureFileContents: Record<string, string> = {
    "app/layout.tsx": `import "./globals.css";\n\nexport default function Layout({ children }: { children: React.ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n`,
    "app/globals.css": `* { box-sizing: border-box; }\nbody { margin: 0; font-family: "Manrope", sans-serif; }\n.offscript { background: #e8eddf; color: #28382e; }\nbutton { font: inherit; cursor: pointer; }\n`,
    "package.json": `{\n  "name": "${mode}-preview",\n  "private": true,\n  "scripts": { "dev": "next dev" }\n}\n`,
  };
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    void Promise.all([
      fetch(`/api/projects/${projectId}`, {
        cache: "no-store",
        signal: controller.signal,
      }),
      fetch(`/api/projects/${projectId}/files`, {
        cache: "no-store",
        signal: controller.signal,
      }),
      fetch(`/api/projects/${projectId}/versions`, {
        cache: "no-store",
        signal: controller.signal,
      }),
      fetch(`/api/projects/${projectId}/runtime`, {
        cache: "no-store",
        signal: controller.signal,
      }),
      fetch(`/api/projects/${projectId}/attachments`, {
        cache: "no-store",
        signal: controller.signal,
      }),
    ])
      .then(
        async ([
          detailResponse,
          filesResponse,
          versionsResponse,
          runtimeResponse,
          attachmentsResponse,
        ]) => {
          const detail = await detailResponse.json();
          if (!detailResponse.ok)
            throw new Error(detail.message || "Couldn't load this project.");
          setProjectName(detail.project?.name || "Project");
          setUserName(detail.userName || "");
          setChatId(detail.conversationId || "");
          const projectMode =
            detail.project?.project_type === "app" ||
            detail.project?.project_type === "video"
              ? detail.project.project_type
              : "website";
          setMode(projectMode);
          const filesResult = await filesResponse.json();
          if (!filesResponse.ok)
            throw new Error(
              filesResult.message || "Couldn't load project files.",
            );
          const list = Array.isArray(filesResult.files)
            ? filesResult.files
            : [];
          setRemoteFiles(list);
          const first = list.find(
            (file: { kind: string }) => file.kind !== "folder",
          );
          setActiveFile(first?.path || "index.html");
          if (first?.path === "app/page.tsx")
            setDrafts((old) => ({
              ...old,
              [projectMode]: first.content || "",
            }));
          else if (first)
            setExtraDrafts((old) => ({
              ...old,
              [`${projectMode}:${first.path}`]: first.content || "",
            }));
          setProjectFilesStatus("ready");
          setMessages(
            (detail.messages || []).map(
              (message: { role: string; body: string }) =>
                `${message.role}: ${message.body}`,
            ),
          );
          if (versionsResponse.ok) {
            const result = await versionsResponse.json();
            const list = Array.isArray(result.versions) ? result.versions : [];
            setRemoteVersions(list);
            setVersion(list.length);
          }
          if (runtimeResponse.ok) {
            const result = await runtimeResponse.json();
            setLiveUnavailable(result.state !== "ready");
          } else setLiveUnavailable(true);
          if (attachmentsResponse.ok) {
            const result = await attachmentsResponse.json();
            setSavedAttachments(
              Array.isArray(result.attachments) ? result.attachments : [],
            );
          }
        },
      )
      .catch((error) => {
        if (!controller.signal.aborted) {
          setProjectFilesStatus("error");
          setNotice(
            error instanceof Error
              ? error.message
              : "Couldn't load this project.",
          );
        }
      });
    return () => controller.abort();
  }, [projectId]);
  useEffect(() => {
    if (dialog) dialogRef.current?.showModal();
  }, [dialog]);
  function closeDialog() {
    dialogRef.current?.close();
    setDialog(null);
  }
  async function saveVersion(description: string, nextPalette = palette) {
    if (projectId) {
      if (projectFilesStatus !== "ready") {
        setNotice(
          projectFilesStatus === "loading"
            ? "Project files are still loading."
            : "Project files couldn't be loaded, so saving is disabled.",
        );
        return;
      }
      setBusy(true);
      try {
        const path = activeFile;
        const content =
          path === "app/page.tsx"
            ? drafts[mode]
            : (extraDrafts[`${mode}:${path}`] ??
              remoteFiles.find((file) => file.path === path)?.content ??
              "");
        const filesToSave = [
          ...remoteFiles.filter((file) => file.path !== path),
          { path, kind: "file", content },
        ];
        const response = await fetch(`/api/projects/${projectId}/files`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: filesToSave,
            expected: remoteFiles.map((file) => ({
              path: file.path,
              kind: file.kind,
              hash: file.hash,
            })),
            description,
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message || "Couldn't save project files.");
        setRemoteFiles(result.files || filesToSave);
        const versionsResponse = await fetch(
          `/api/projects/${projectId}/versions`,
          { cache: "no-store" },
        );
        if (versionsResponse.ok) {
          const versionsData = await versionsResponse.json();
          setRemoteVersions(versionsData.versions || []);
        }
        setDirty(false);
        setNotice("Project source saved to your account.");
      } catch (error) {
        setNotice(
          error instanceof Error
            ? error.message
            : "Couldn't save project source.",
        );
      } finally {
        setBusy(false);
      }
      return;
    }
    const next = Math.max(...versions.map((item) => item.id)) + 1;
    setVersions((items) => [
      {
        id: next,
        description,
        palette: nextPalette,
        mode,
        drafts: { ...drafts },
        extraDrafts: { ...extraDrafts },
        activeFile,
      },
      ...items,
    ]);
    setVersion(next);
    setNotice("Saved in this preview");
  }
  function restore(item: Version) {
    setVersion(item.id);
    setPalette(item.palette);
    setMode(item.mode);
    setDrafts({ ...item.drafts });
    setExtraDrafts({ ...item.extraDrafts });
    setActiveFile(item.activeFile);
    setDirty(false);
    setNotice(`Restored version ${item.id}`);
  }
  async function setProjectMode(next: WorkspaceProjectView) {
    if (!projectId) {
      setMode(next);
      return;
    }
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectType: next }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't update project type.");
      setMode(next);
      setNotice("Project type saved.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't update project type.",
      );
    }
  }
  async function restoreRemoteVersion(id: string) {
    if (!projectId) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/versions/${id}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected: remoteFiles.map((file) => ({
              path: file.path,
              kind: file.kind,
              hash: file.hash,
            })),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't restore this version.");
      const list = result.files || [];
      setRemoteFiles(list);
      const first = list.find(
        (file: { kind: string }) => file.kind !== "folder",
      );
      if (first) {
        setActiveFile(first.path);
        if (first.path === "app/page.tsx")
          setDrafts((old) => ({ ...old, [mode]: first.content || "" }));
        else
          setExtraDrafts((old) => ({
            ...old,
            [`${mode}:${first.path}`]: first.content || "",
          }));
      }
      setNotice("Saved version restored.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't restore this version.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function send() {
    if (!prompt.trim() || messageLock.current) return;
    const text = prompt.trim();
    if (projectId) {
      messageLock.current = true;
      const key = JSON.stringify({ message: text, chatId: chatId || null });
      if (pendingMessage.current?.key !== key)
        pendingMessage.current = { key, id: crypto.randomUUID() };
      try {
        const response = await fetch(`/api/projects/${projectId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            chatId: chatId || undefined,
            requestId: pendingMessage.current.id,
            generate: false,
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message || "Couldn't save the message.");
        setChatId(result.conversationId || chatId);
        setMessages((items) => [...items, `user: ${text}`]);
        setGenerationNotice(
          result.generation?.message ||
            "AI generation is unavailable in this local setup.",
        );
        pendingMessage.current = null;
      } catch (error) {
        setNotice(
          error instanceof Error ? error.message : "Couldn't save the message.",
        );
        return;
      } finally {
        messageLock.current = false;
      }
    } else {
      setMessages((items) => [...items, text]);
      void saveVersion("Updated project direction");
    }
    setPrompt("");
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copied to clipboard");
    } catch {
      setNotice("Select the link to copy it.");
    }
  }
  async function loadShare() {
    if (!projectId) return;
    setDialog("share");
    try {
      const response = await fetch(`/api/projects/${projectId}/share`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't load sharing settings.");
      setShareEnabled(Boolean(result.enabled));
      setShareUrl(result.url || "");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't load sharing settings.",
      );
    }
  }
  async function toggleShare() {
    if (!projectId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/share`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !shareEnabled }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't update sharing settings.");
      setShareEnabled(Boolean(result.enabled));
      setShareUrl(result.url || "");
      setNotice(
        result.enabled ? "Share link enabled." : "Share link disabled.",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't update sharing settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function publishProject() {
    if (!projectId) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/publish`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't publish this project.");
      setNotice(result.url ? `Published: ${result.url}` : "Project published.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't publish this project.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function exportProject() {
    if (!projectId) return;
    try {
      const response = await fetch(`/api/projects/${projectId}/export`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Couldn't export project.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "runly-project.json";
      link.click();
      URL.revokeObjectURL(url);
      setNotice("Project source exported as JSON.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Couldn't export project.",
      );
    }
  }
  const projectUrl =
    shareUrl && typeof window !== "undefined"
      ? new URL(shareUrl, window.location.origin).toString()
      : "Sharing is off";

  return (
    <div className={`${styles.root} ${light ? styles.light : ""}`}>
      <input
        ref={fileInput}
        className={styles.srOnly}
        aria-label="Attach project files"
        tabIndex={-1}
        type="file"
        multiple
        onChange={(event) => {
          if (projectId) {
            const picked = Array.from(event.target.files || []);
            event.target.value = "";
            if (!picked.length) return;
            if (
              picked.length > 5 ||
              picked.some((file) => file.size > 8 * 1024 * 1024) ||
              picked.reduce((sum, file) => sum + file.size, 0) >
                20 * 1024 * 1024
            ) {
              setNotice(
                "Choose up to five files, each 8 MB or smaller, with a 20 MB total limit.",
              );
              return;
            }
            const form = new FormData();
            for (const file of picked) form.append("files", file);
            form.append("requestId", crypto.randomUUID());
            setBusy(true);
            void fetch(`/api/projects/${projectId}/attachments`, {
              method: "POST",
              body: form,
            })
              .then(async (response) => {
                const result = await response.json();
                if (!response.ok)
                  throw new Error(
                    result.message || "Couldn't upload project attachments.",
                  );
                setSavedAttachments((items) => [
                  ...items,
                  ...(result.attachments || []),
                ]);
                setNotice("Attachments saved to this project.");
              })
              .catch((error) =>
                setNotice(
                  error instanceof Error
                    ? error.message
                    : "Couldn't upload project attachments.",
                ),
              )
              .finally(() => setBusy(false));
            return;
          }
          setFiles((items) => [
            ...new Set([
              ...items,
              ...Array.from(event.target.files || []).map((file) => file.name),
            ]),
          ]);
          setSideTab("Files");
          event.target.value = "";
        }}
      />
      <aside className={styles.rail} aria-label="Editor navigation">
        <Link href="/dashboard/projects" aria-label="Runly home">
          <Logo size={31} />
        </Link>
        <Link href="/dashboard/projects" aria-label="All projects">
          <Icon file="0bef9" />
        </Link>
        {[
          ["website", "ddf1f"],
          ["video", "e12fb"],
          ["app", "8f462"],
        ].map(([value, file]) => (
          <button
            key={value}
            aria-label={`${value} editor`}
            className={mode === value ? styles.railActive : ""}
            onClick={() => void setProjectMode(value as WorkspaceProjectView)}
          >
            <Icon file={file} />
          </button>
        ))}
        <button
          className={styles.themeButton}
          onClick={() => setLight((value) => !value)}
          aria-label={light ? "Use dark appearance" : "Use light appearance"}
        >
          <Icon file="763ab" />
        </button>
        <Link
          className={styles.avatar}
          href="/settings"
          aria-label="Furat account settings"
        >
          {(userName || "A").slice(0, 1).toUpperCase()}
        </Link>
      </aside>
      <aside className={styles.sidebar} aria-label="Project tools">
        <header className={styles.projectHeader}>
          <select
            aria-label="Project"
            value={mode}
            onChange={(event) =>
              void setProjectMode(event.target.value as WorkspaceProjectView)
            }
          >
            {workspaceProjects.map((item) => (
              <option key={item.view} value={item.view}>
                {item.name}
              </option>
            ))}
          </select>
          <Icon file="6734f" />
          <p>{projectName || "New project"}</p>
        </header>
        <div
          className={styles.sideTabs}
          role="tablist"
          aria-label="Project tools"
        >
          {["Chat", "Files", "History"].map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={sideTab === value}
              onClick={() => setSideTab(value)}
            >
              {value}
            </button>
          ))}
        </div>
        {sideTab === "Chat" ? (
          <>
            <div className={styles.conversation}>
              {projectId ? (
                <>
                  {messages.map((message, index) => (
                    <div className={styles.followup} key={index}>
                      {message}
                    </div>
                  ))}
                  {!messages.length && (
                    <p>No saved messages yet. Ask Runly about this project.</p>
                  )}
                  {generationNotice && <p role="status">{generationNotice}</p>}
                  <p>
                    Messages save to this project. AI generation is unavailable
                    in this local setup.
                  </p>
                </>
              ) : (
                <>
                  <div className={styles.userMessage}>
                    {mode === "website" ? (
                      <>
                        Build a website for Offscript,
                        <br />
                        my creative studio. Make it
                        <br />
                        bold, minimal, and olive.
                      </>
                    ) : mode === "app" ? (
                      "Create a calm habit-tracking app called Daylight."
                    ) : (
                      "Turn these clips into a dreamy 15-second edit."
                    )}
                  </div>
                  <div className={styles.assistant}>
                    <Logo size={22} />
                    <strong>Runly</strong>
                    <span>Completed</span>
                  </div>
                  <p>
                    Your first direction is ready.
                    <br />I kept the layout editorial and
                    <br />
                    gave your work room to breathe.
                  </p>
                  <ul>
                    {[
                      "Responsive homepage",
                      "Selected work & studio sections",
                      "Contact form",
                    ].map((item) => (
                      <li key={item}>
                        <Icon file="5a8d1" />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <button
                    className={styles.result}
                    onClick={() => {
                      setTab("Preview");
                      setNotice(`Viewing version ${version}`);
                    }}
                  >
                    <span>
                      <Icon file="98697" />
                      <strong>Homepage created</strong>
                      <Icon file="14e18" />
                    </span>
                    <small>6 sections · Version {version}</small>
                  </button>
                  <p className={styles.changeQuestion}>
                    What would you like to change?
                  </p>
                  <div className={styles.responseTools}>
                    <button
                      onClick={() =>
                        void copy(
                          "Your first direction is ready. I kept the layout editorial and gave your work room to breathe.",
                        )
                      }
                      aria-label="Copy response"
                    >
                      <Icon file="10580" />
                    </button>
                    <button
                      aria-label="Undo last change"
                      onClick={() => {
                        const previous = versions.find(
                          (item) => item.id < version,
                        );
                        if (previous) restore(previous);
                      }}
                    >
                      <Icon file="4a5e7" />
                    </button>
                  </div>
                  {messages.map((message, index) => (
                    <div className={styles.followup} key={index}>
                      {message}
                      <p>
                        Your direction is saved in this preview conversation.
                      </p>
                    </div>
                  ))}
                </>
              )}
            </div>
            {!projectId && (
              <button
                className={styles.paletteButton}
                onClick={() => {
                  setPalette((value) => !value);
                  saveVersion("Tried a new color palette", !palette);
                }}
              >
                Try a new color palette
              </button>
            )}
            <form
              className={styles.composer}
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <textarea
                ref={promptRef}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder="Tell Runly what to change…"
                aria-label="Message Runly"
              />
              <div>
                <button
                  type="button"
                  aria-label="Attach files"
                  onClick={() => fileInput.current?.click()}
                >
                  <Icon file="90f15" />
                </button>
                <label>
                  <span className={styles.srOnly}>Model</span>
                  <select
                    defaultValue="Auto"
                    disabled={Boolean(projectId)}
                    title={
                      projectId
                        ? "Model selection is unavailable while generation is disabled."
                        : undefined
                    }
                  >
                    <option>Auto</option>
                    <option>Fast</option>
                    <option>Thinking</option>
                  </select>
                  <Icon file="91d66" />
                </label>
                <button
                  className={styles.send}
                  aria-label="Send message"
                  disabled={!prompt.trim()}
                >
                  <Icon file="445f3" />
                </button>
              </div>
            </form>
            <small className={styles.review}>Review before publishing.</small>
          </>
        ) : sideTab === "Files" ? (
          <div className={styles.toolPanel}>
            <h2>Project files</h2>
            {(projectId
              ? remoteFiles
                  .filter((file) => file.kind !== "folder")
                  .map((file) => file.path)
              : [
                  "app/page.tsx",
                  "app/layout.tsx",
                  "app/globals.css",
                  "package.json",
                  ...files,
                ]
            ).map((file) => (
              <button
                key={file}
                onClick={() => {
                  setTab("Code");
                  setActiveFile(file);
                  const source = remoteFiles.find((item) => item.path === file);
                  if (source) {
                    if (file === "app/page.tsx")
                      setDrafts((old) => ({ ...old, [mode]: source.content }));
                    else
                      setExtraDrafts((old) => ({
                        ...old,
                        [`${mode}:${file}`]: source.content,
                      }));
                  }
                  setNotice(`Opened ${file}`);
                }}
              >
                {file}
              </button>
            ))}
            <button
              className={styles.uploadButton}
              onClick={() => fileInput.current?.click()}
              disabled={
                (Boolean(projectId) && projectFilesStatus !== "ready") || busy
              }
            >
              {projectId ? "Upload reference files" : "Upload files"}
            </button>
            {projectId && (
              <p>
                Saved attachments are reference files. They don’t become
                editable source files.
              </p>
            )}
            {savedAttachments.map((attachment) => (
              <a
                key={attachment.id}
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
              >
                {attachment.name} · {(attachment.size / 1024).toFixed(0)} KB
              </a>
            ))}
          </div>
        ) : (
          <div className={styles.toolPanel}>
            <h2>Version history</h2>
            {(projectId ? remoteVersions : versions).map((item) => (
              <button
                className={version === item.id ? styles.selectedHistory : ""}
                key={item.id}
                onClick={() =>
                  projectId
                    ? void restoreRemoteVersion(item.id as unknown as string)
                    : restore(item as Version)
                }
              >
                <strong>Version {item.id}</strong>
                <span>{item.description}</span>
                <small>
                  {!projectId && version === item.id
                    ? "Current version"
                    : "Restore this version"}
                </small>
              </button>
            ))}
          </div>
        )}
      </aside>
      <main className={styles.main}>
        <header className={styles.toolbar}>
          <div
            className={styles.modeTabs}
            role="tablist"
            aria-label="Project mode"
          >
            {[
              ["website", "Website"],
              ["video", "Video"],
              ["app", "App"],
            ].map(([value, label]) => (
              <button
                key={value}
                role="tab"
                aria-selected={mode === value}
                onClick={() =>
                  void setProjectMode(value as WorkspaceProjectView)
                }
              >
                {label}
              </button>
            ))}
          </div>
          <span className={styles.saveStatus}>
            <Icon file="04fa0" />
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
          <div className={styles.actions}>
            <button onClick={() => void loadShare()}>Share</button>
            <button
              className={styles.primary}
              onClick={() => setDialog("publish")}
            >
              {mode === "video" ? "Export" : "Publish"}
            </button>
          </div>
        </header>
        <div className={styles.canvasArea}>
          <div className={styles.previewToolbar}>
            <div
              className={styles.previewTabs}
              role="tablist"
              aria-label="Project view"
            >
              {["Preview", "Code"].map((value) => (
                <button
                  role="tab"
                  key={value}
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <span className={styles.domain}>
              <Icon file="c8310" />
              {projectId
                ? projectName || "Saved project"
                : mode === "website"
                  ? "offscript"
                  : mode === "app"
                    ? "daylight"
                    : "cloud-nine"}
            </span>
            <label className={styles.device}>
              <span className={styles.srOnly}>Device</span>
              <select
                value={device}
                onChange={(event) => setDevice(event.target.value)}
              >
                <option>Desktop</option>
                <option>Tablet</option>
                <option>Mobile</option>
              </select>
            </label>
            <label className={styles.zoom}>
              <span className={styles.srOnly}>Zoom</span>
              <select
                value={zoom}
                onChange={(event) => setZoom(event.target.value)}
              >
                <option>100%</option>
                <option>75%</option>
                <option>50%</option>
              </select>
            </label>
            <Link
              className={styles.openPreview}
              href={
                projectId
                  ? `/project/${projectId}`
                  : `/workspace/${mode}?preview=true`
              }
              aria-label="Open project preview"
            >
              <Icon file="f0dae" />
            </Link>
          </div>
          {tab === "Code" ? (
            <div className={styles.code}>
              <div>
                {projectId &&
                remoteFiles.some((file) => file.kind !== "folder") ? (
                  <select
                    aria-label="Project file"
                    value={activeFile}
                    onChange={(event) => {
                      const path = event.target.value;
                      setActiveFile(path);
                      const file = remoteFiles.find(
                        (item) => item.path === path,
                      );
                      if (!file) return;
                      if (path === "app/page.tsx")
                        setDrafts((old) => ({ ...old, [mode]: file.content }));
                      else
                        setExtraDrafts((old) => ({
                          ...old,
                          [`${mode}:${path}`]: file.content,
                        }));
                      setDirty(false);
                    }}
                  >
                    {remoteFiles
                      .filter((file) => file.kind !== "folder")
                      .map((file) => (
                        <option key={file.path} value={file.path}>
                          {file.path}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span>{activeFile}</span>
                )}
                <button
                  disabled={
                    !dirty ||
                    busy ||
                    (Boolean(projectId) && projectFilesStatus !== "ready")
                  }
                  onClick={() => {
                    void saveVersion("Edited source code");
                  }}
                >
                  Save
                </button>
              </div>
              <textarea
                aria-label="Project source code"
                spellCheck={false}
                value={
                  activeFile === "app/page.tsx"
                    ? drafts[mode]
                    : projectId
                      ? (extraDrafts[`${mode}:${activeFile}`] ??
                        remoteFiles.find((file) => file.path === activeFile)
                          ?.content ??
                        "")
                      : (extraDrafts[`${mode}:${activeFile}`] ??
                        fixtureFileContents[activeFile] ??
                        `// ${activeFile}\n`)
                }
                readOnly={Boolean(projectId) && projectFilesStatus !== "ready"}
                onChange={(event) => {
                  if (activeFile === "app/page.tsx")
                    setDrafts((items) => ({
                      ...items,
                      [mode]: event.target.value,
                    }));
                  else
                    setExtraDrafts((items) => ({
                      ...items,
                      [`${mode}:${activeFile}`]: event.target.value,
                    }));
                  setDirty(true);
                }}
              />
              <p>
                {projectId
                  ? projectFilesStatus === "loading"
                    ? "Loading saved project files…"
                    : projectFilesStatus === "error"
                      ? "Project files could not be loaded. Editing and saving are disabled."
                      : "Source edits save to your project."
                  : "Changes are saved for this preview session."}
              </p>
            </div>
          ) : projectId ? (
            <div className={styles.previewContainer}>
              <h2>Preview unavailable</h2>
              <p>
                {liveUnavailable
                  ? "The local setup has no project sandbox runtime. Project source and history remain available."
                  : "The project runtime is connected, but this editor has no live preview surface. Project source and history remain available."}
              </p>
            </div>
          ) : (
            <div
              className={`${styles.previewContainer} ${device === "Mobile" ? styles.mobileCanvas : device === "Tablet" ? styles.tabletCanvas : ""}`}
              style={{ zoom: zoom === "75%" ? 0.75 : zoom === "50%" ? 0.5 : 1 }}
            >
              {mode === "website" ? (
                <article
                  className={`${styles.site} ${palette ? styles.alternatePalette : ""}`}
                >
                  <header>
                    <strong>offscript®</strong>
                    <nav aria-label="Website preview navigation">
                      <button
                        onClick={() =>
                          document
                            .getElementById("editor-selected-work")
                            ?.scrollIntoView({
                              behavior: "smooth",
                              block: "nearest",
                            })
                        }
                      >
                        Work
                      </button>
                      <button onClick={() => setDialog("work")}>Studio</button>
                      <button onClick={() => setDialog("work")}>Contact</button>
                    </nav>
                  </header>
                  <h1>
                    Ideas with character.
                    <br />
                    Design with purpose.
                  </h1>
                  <p>
                    An independent studio shaping bold identities
                    <br />
                    and digital experiences for people moving forward.
                  </p>
                  <button
                    className={styles.siteCta}
                    onClick={() => setDialog("work")}
                  >
                    Let’s make something
                  </button>
                  <div className={styles.workHeading} id="editor-selected-work">
                    <strong>Selected work</strong>
                    <span>2024 — 2026</span>
                  </div>
                  <div className={styles.workCards}>
                    <button
                      className={styles.commonGround}
                      onClick={() => setDialog("work")}
                    >
                      <span>Brand identity</span>
                      <strong>
                        COMMON
                        <br />
                        GROUND
                      </strong>
                    </button>
                    <button
                      className={styles.sunday}
                      onClick={() => setDialog("work")}
                    >
                      <span>Digital experience</span>
                      <strong>Sunday</strong>
                      <p>Coffee, slowly.</p>
                    </button>
                  </div>
                </article>
              ) : mode === "video" ? (
                <div className={styles.video}>
                  <Image
                    src="/figma/workspace/3a6d8.png"
                    fill
                    sizes="70vw"
                    alt="Sunlit clouds around a clear blue sky"
                  />
                  <h1>
                    a little closer
                    <br />
                    to the sky.
                  </h1>
                  <button
                    aria-label={playing ? "Pause preview" : "Play preview"}
                    onClick={() => setPlaying((value) => !value)}
                  >
                    {playing ? <Pause /> : <Play />}
                  </button>
                  <span>OFFLINE WEEKENDS</span>
                </div>
              ) : (
                <div className={styles.appCanvas}>
                  <div className={styles.phone}>
                    <small>9:41</small>
                    <h1>Daylight</h1>
                    <p>A little better, every day.</p>
                    <h2>Your week</h2>
                    <div className={styles.chart}>
                      {[34, 58, 48, 80, 66, 96, 20].map((height, index) => (
                        <div key={index}>
                          <span
                            style={{
                              height,
                              background: index === 5 ? "#638969" : undefined,
                            }}
                          />
                          <small>
                            {["M", "T", "W", "T", "F", "S", "S"][index]}
                          </small>
                        </div>
                      ))}
                    </div>
                    <h3>TODAY</h3>
                    {["Morning walk", "Read 10 pages", "Make something"].map(
                      (habit, index) => (
                        <button
                          key={habit}
                          aria-pressed={habits[index]}
                          onClick={() =>
                            setHabits((items) =>
                              items.map((value, i) =>
                                i === index ? !value : value,
                              ),
                            )
                          }
                        >
                          <img
                            src={`/figma/workspace/${habits[index] ? "0c9cb" : "c3bc9"}.svg`}
                            alt=""
                          />
                          {habit}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
          <footer className={styles.versionBar}>
            <Icon file="c9e85" />
            <div>
              <strong>
                {projectId
                  ? remoteVersions.length
                    ? `Version ${remoteVersions.length}`
                    : "No saved versions"
                  : `Version ${version}`}
              </strong>
              <small>
                {selectedVersion?.description ||
                  (projectId ? "No saved versions yet" : "Preview session")}
              </small>
            </div>
            <button
              className={styles.historyButton}
              onClick={() => setSideTab("History")}
            >
              Version history
            </button>
            <button
              className={styles.undoButton}
              disabled={!versions.some((item) => item.id < version)}
              onClick={() => {
                const previous = versions.find((item) => item.id < version);
                if (previous) restore(previous);
              }}
            >
              <Icon file="2e0b9" />
              Undo
            </button>
          </footer>
        </div>
      </main>
      {notice && (
        <div className={styles.toast} role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {dialog && (
        <dialog
          ref={dialogRef}
          className={styles.dialog}
          onCancel={closeDialog}
          onClick={(event) => {
            if (event.currentTarget === event.target) closeDialog();
          }}
        >
          <button
            className={styles.close}
            aria-label="Close dialog"
            onClick={closeDialog}
          >
            <X size={20} />
          </button>
          <h2>
            {dialog === "share"
              ? "Share your project"
              : dialog === "publish"
                ? mode === "video"
                  ? "Export your video"
                  : "Publish your project"
                : "Let’s make something"}
          </h2>
          {dialog === "share" ? (
            <>
              <p>Copy a read-only link to this saved source snapshot.</p>
              <input aria-label="Preview link" value={projectUrl} readOnly />
              <button
                className={styles.primary}
                disabled={!shareUrl}
                onClick={() => void copy(projectUrl)}
              >
                Copy link
              </button>
              <button
                className={styles.primary}
                disabled={busy}
                onClick={() => void toggleShare()}
              >
                {shareEnabled ? "Disable sharing" : "Enable sharing"}
              </button>
              <p>
                Anyone with the link can view the project source. Links expire
                after 7 days.
              </p>
            </>
          ) : dialog === "publish" ? (
            <>
              <p>{projectName || current.name} is saved in your workspace.</p>
              <p>
                {mode === "video"
                  ? "Video rendering is unavailable. Download the saved project source as JSON."
                  : "Static publishing requires a root index.html. Framework builds require a runtime, which is unavailable locally."}
              </p>
              <button
                className={styles.primary}
                disabled={busy}
                onClick={() =>
                  mode === "video"
                    ? void exportProject()
                    : void publishProject()
                }
              >
                {mode === "video"
                  ? "Download source JSON"
                  : "Publish static site"}
              </button>
              <button className={styles.secondary} onClick={closeDialog}>
                Close
              </button>
            </>
          ) : (
            <>
              <p>Independent design for people doing things differently.</p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setNotice("Your message is ready in this preview.");
                  closeDialog();
                }}
              >
                <input
                  aria-label="Your email"
                  required
                  type="email"
                  placeholder="Your email"
                />
                <textarea
                  aria-label="Your idea"
                  required
                  placeholder="Tell us about your idea"
                />
                <button className={styles.primary}>Send message</button>
              </form>
            </>
          )}
        </dialog>
      )}
    </div>
  );
}
