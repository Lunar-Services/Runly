"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Menu, Pause, Plus, X } from "lucide-react";
import {
  workspaceCode,
  workspaceFixtures,
  workspaceProjects,
  type WorkspaceProjectView,
  type WorkspaceView,
} from "../lib/workspace-ui-fixtures";
import styles from "./workspace-ui.module.css";
import { WorkspaceEditorUI } from "./workspace-editor-ui";

const iconFiles = {
  search: "69e53.svg",
  plus: "3f384.svg",
  globe: "af28a.svg",
  video: "fc7d6.svg",
  app: "15e2d.svg",
  activeGlobe: "d98ea.svg",
  activeApp: "0889f.svg",
  activeVideo: "e4fd7.svg",
  play: "d0e91.svg",
  chatPlus: "ca877.svg",
  check: "c557a.svg",
  copy: "73523.svg",
  attach: "2ca01.svg",
  up: "f78cf.svg",
  newAttach: "11df2.svg",
  newUp: "13ce8.svg",
  chevron: "93588.svg",
  habitCheck: "0c9cb.svg",
  habitPlus: "c3bc9.svg",
} as const;
type IconName = keyof typeof iconFiles;
function Icon({ name }: { name: IconName }) {
  return (
    <img
      className={styles.assetIcon}
      src={`/figma/workspace/${iconFiles[name]}`}
      alt=""
      aria-hidden="true"
    />
  );
}
function Mark({ size = 30 }: { size?: number }) {
  return (
    <span className={styles.mark} style={{ width: size, height: size }}>
      <Image
        src="/figma/workspace/b9eb4.png"
        width={size - 6}
        height={size - 6}
        alt=""
      />
    </span>
  );
}
type LocalMessage = { role: "user" | "assistant"; body: string };
type Dialog = "share" | "publish" | "account" | null;

function readWorkspaceEntry(prompt: string, attachments: string[]) {
  const fallback = {
    prompt: prompt.slice(0, 10000),
    attachments: attachments
      .filter((name) => typeof name === "string")
      .slice(0, 5)
      .map((name) => name.slice(0, 200)),
  };
  if (prompt || attachments.length || typeof window === "undefined")
    return fallback;
  try {
    const raw = sessionStorage.getItem("runly:workspace-entry");
    if (!raw || raw.length > 20000) return fallback;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return fallback;
    const entry = value as { prompt?: unknown; attachments?: unknown };
    return {
      prompt:
        typeof entry.prompt === "string" ? entry.prompt.slice(0, 10000) : "",
      attachments: Array.isArray(entry.attachments)
        ? entry.attachments
            .filter((name): name is string => typeof name === "string")
            .slice(0, 5)
            .map((name) => name.slice(0, 200))
        : [],
    };
  } catch {
    return fallback;
  }
}

export function WorkspaceUI(props: {
  initialView?: WorkspaceView;
  initialPrompt?: string;
  initialAttachments?: string[];
  projectId?: string;
}) {
  if (props.initialView === "editor")
    return <WorkspaceEditorUI projectId={props.projectId} />;
  return <StandardWorkspaceUI {...props} initialView={props.initialView} />;
}

function StandardWorkspaceUI({
  initialView = "new",
  initialPrompt = "",
  initialAttachments = [],
  projectId: initialProjectId,
}: {
  initialView?: Exclude<WorkspaceView, "editor">;
  initialPrompt?: string;
  initialAttachments?: string[];
  projectId?: string;
}) {
  const router = useRouter();
  const [entry] = useState(() =>
    readWorkspaceEntry(initialPrompt, initialAttachments),
  );
  const [view, setView] =
    useState<Exclude<WorkspaceView, "editor">>(initialView);
  const [mobileNav, setMobileNav] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [freshChat, setFreshChat] = useState(false);
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState(entry.prompt);
  const [model, setModel] = useState("Auto");
  const [attachments, setAttachments] = useState<string[]>(entry.attachments);
  const [mobilePane, setMobilePane] = useState<"chat" | "preview">("chat");
  const [messages, setMessages] = useState<
    Partial<Record<WorkspaceProjectView, LocalMessage[]>>
  >({});
  const [projectId, setProjectId] = useState(initialProjectId || "");
  const [projectName, setProjectName] = useState("");
  const [userName, setUserName] = useState("");
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [runtimeFiles, setRuntimeFiles] = useState<
    Array<{ path: string; kind?: string; content: string; hash?: string }>
  >([]);
  const [projectFilesStatus, setProjectFilesStatus] = useState<
    "loading" | "ready" | "error"
  >(initialProjectId ? "loading" : "ready");
  const [activeFilePath, setActiveFilePath] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadedComposerAttachments, setUploadedComposerAttachments] =
    useState<Array<{ id: string; name: string }>>([]);
  const [savedAttachments, setSavedAttachments] = useState<
    Array<{ id: string; name: string; size: number; url: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState("");
  const [savedChats, setSavedChats] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [versionCount, setVersionCount] = useState(0);
  const [savedVersions, setSavedVersions] = useState<
    Array<{ id: string; description: string; created_at: string }>
  >([]);
  const [shareUrl, setShareUrl] = useState("");
  const [shareEnabled, setShareEnabled] = useState(false);
  const [publishedUrl, setPublishedUrl] = useState("");
  const versions = { website: 1, app: 1, video: 1 };
  const [tab, setTab] = useState<"preview" | "code" | "timeline">("preview");
  const [device, setDevice] = useState("Desktop");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [drafts, setDrafts] = useState<Record<WorkspaceProjectView, string>>(
    () =>
      initialProjectId
        ? { website: "", app: "", video: "" }
        : { ...workspaceCode },
  );
  const [dirty, setDirty] = useState(false);
  const [siteSection, setSiteSection] = useState("home");
  const [habits, setHabits] = useState([true, true, false]);
  const [playing, setPlaying] = useState(false);
  const [videoPosition, setVideoPosition] = useState(6);
  const fileInput = useRef<HTMLInputElement>(null);
  const submitLock = useRef(false);
  const attachmentRequestId = useRef("");
  const messageRequest = useRef<{ key: string; id: string } | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const active = view === "new" ? null : view;
  const conversationMessages = active ? messages[active] || [] : [];
  const project = workspaceProjects.find((item) => item.view === view);
  const fixture = active ? workspaceFixtures[active] : null;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (response.ok && Array.isArray(result.projects))
          setProjects(result.projects);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    async function loadProject() {
      try {
        const [
          detailResponse,
          runtimeResponse,
          filesResponse,
          versionsResponse,
          attachmentsResponse,
        ] = await Promise.all([
          fetch(`/api/projects/${projectId}`, {
            cache: "no-store",
            signal: controller.signal,
          }),
          fetch(`/api/projects/${projectId}/runtime`, {
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
          fetch(`/api/projects/${projectId}/attachments`, {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        const detail = await detailResponse.json();
        if (!detailResponse.ok)
          throw new Error(detail.message || "Couldn't load this project.");
        setProjectName(detail.project?.name || "Project");
        setUserName(detail.userName || "");
        const projectType = detail.project?.project_type;
        if (
          projectType === "website" ||
          projectType === "app" ||
          projectType === "video"
        )
          setView(projectType);
        setChatId(detail.conversationId || "");
        setSavedChats(Array.isArray(detail.chats) ? detail.chats : []);
        setMessages({
          [view === "new" ? "website" : view]: (detail.messages || []).map(
            (item: { role: string; body: string }) => ({
              role: item.role === "assistant" ? "assistant" : "user",
              body: item.body,
            }),
          ),
        });
        if (runtimeResponse.ok) {
          const runtime = await runtimeResponse.json();
          setNotice(
            runtime.state === "ready"
              ? "Project runtime is ready."
              : `Runtime: ${runtime.state || "unavailable"}.`,
          );
        }
        const files = await filesResponse.json();
        if (!filesResponse.ok)
          throw new Error(files.message || "Couldn't load project files.");
        const fileList = Array.isArray(files.files) ? files.files : [];
        setRuntimeFiles(fileList);
        const source = fileList.find(
          (item: { kind?: string }) => item.kind !== "folder",
        );
        setActiveFilePath(source?.path || "index.html");
        setDrafts((old) => ({
          ...old,
          [view === "new" ? "website" : view]: source?.content || "",
        }));
        setProjectFilesStatus("ready");
        if (versionsResponse.ok) {
          const versions = await versionsResponse.json();
          setVersionCount(
            Array.isArray(versions.versions) ? versions.versions.length : 0,
          );
          setSavedVersions(
            Array.isArray(versions.versions) ? versions.versions : [],
          );
        }
        if (attachmentsResponse.ok) {
          const attachments = await attachmentsResponse.json();
          setSavedAttachments(
            Array.isArray(attachments.attachments)
              ? attachments.attachments
              : [],
          );
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setProjectFilesStatus("error");
          setNotice(
            error instanceof Error
              ? error.message
              : "Couldn't load this project.",
          );
        }
      }
    }
    void loadProject();
    return () => controller.abort();
  }, [projectId, view]);

  useEffect(() => {
    try {
      sessionStorage.removeItem("runly:workspace-entry");
    } catch {
      /* The composer remains usable when browser storage is disabled. */
    }
  }, []);

  useEffect(() => {
    if (dialog) dialogRef.current?.showModal();
  }, [dialog]);
  useEffect(() => {
    if (conversation.current)
      conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [messages]);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => setVideoPosition((current) => (current >= 15 ? 0 : current + 1)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [playing]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function openProject(next: Exclude<WorkspaceView, "editor">) {
    if (next === "new") {
      setProjectId("");
      setProjectName("");
      router.push("/dashboard/projects/new");
      return;
    }
    setView(next);
    setPrompt("");
    setAttachments([]);
    setNotice("");
    setMobileNav(false);
    setTab("preview");
    setDirty(false);
    setSiteSection("home");
    setMobilePane("chat");
    setPlaying(false);
    setFreshChat(false);
  }
  function startWith(next: WorkspaceProjectView) {
    setPrompt(
      next === "website"
        ? "Build a website "
        : next === "app"
          ? "Create an app "
          : "Edit a video ",
    );
    composer.current?.focus();
  }
  async function startNewChat() {
    if (!projectId) {
      setNotice("Create a project before starting a saved chat.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't start a new chat.");
      setChatId(result.chat?.id || "");
      setFreshChat(true);
      setMessages((current) => ({ ...current, [active || "website"]: [] }));
      setNotice("New chat created.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Couldn't start a new chat.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function openSavedChat(id: string) {
    if (!projectId) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}?chat=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't load this chat.");
      setChatId(id);
      setMessages({
        [active || "website"]: (result.messages || []).map(
          (item: { role: string; body: string }) => ({
            role: item.role === "assistant" ? "assistant" : "user",
            body: item.body,
          }),
        ),
      });
      setFreshChat(false);
      setNotice("Saved chat loaded.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Couldn't load this chat.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function saveProjectFile() {
    if (!projectId) return;
    if (projectFilesStatus !== "ready") {
      setNotice(
        projectFilesStatus === "loading"
          ? "Project files are still loading."
          : "Project files couldn't be loaded, so saving is disabled.",
      );
      return;
    }
    const path =
      activeFilePath ||
      runtimeFiles.find((item) => item.kind !== "folder")?.path ||
      "index.html";
    const content = drafts[active || "website"];
    const nextFiles = [
      ...runtimeFiles.filter((item) => item.path !== path),
      { path, kind: "file", content },
    ];
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/files`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: nextFiles,
          expected: runtimeFiles.map((item) => ({
            path: item.path,
            kind: item.kind === "folder" ? "folder" : "file",
            hash: item.hash || "",
          })),
          description: "Saved source changes",
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't save project files.");
      setRuntimeFiles(Array.isArray(result.files) ? result.files : nextFiles);
      const versionResponse = await fetch(
        `/api/projects/${projectId}/versions`,
        { cache: "no-store" },
      );
      if (versionResponse.ok) {
        const versions = await versionResponse.json();
        setVersionCount(
          Array.isArray(versions.versions)
            ? versions.versions.length
            : versionCount + 1,
        );
        setSavedVersions(
          Array.isArray(versions.versions) ? versions.versions : [],
        );
      }
      setDirty(false);
      setNotice("Project files saved.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Couldn't save project files.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function restoreVersion(versionId: string) {
    if (!projectId) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/versions/${versionId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            expected: runtimeFiles.map((item) => ({
              path: item.path,
              kind: item.kind === "folder" ? "folder" : "file",
              hash: item.hash || "",
            })),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't restore this version.");
      const files = Array.isArray(result.files) ? result.files : [];
      setRuntimeFiles(files);
      const source = files.find(
        (item: { kind?: string }) => item.kind !== "folder",
      );
      if (source) {
        setActiveFilePath(source.path);
        setDrafts((old) => ({
          ...old,
          [active || "website"]: source.content || "",
        }));
      }
      setDirty(false);
      setNotice("Version restored.");
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
  async function loadShare() {
    if (!projectId) {
      setNotice("Create a saved project before sharing it.");
      return;
    }
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
      setPublishedUrl(result.published ? result.siteUrl || "" : "");
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
      setPublishedUrl(result.published ? result.siteUrl || "" : "");
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
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${projectId}/publish`, {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't publish this project.");
      setPublishedUrl(result.url || "");
      setShareEnabled(false);
      setShareUrl("");
      setNotice(
        "Static site published. Project source remains private unless you enable source sharing.",
      );
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
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/export`, {
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.message || "Couldn't export this project.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(projectName || "runly-project").replace(/[^a-z0-9-_]+/gi, "-")}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("Project source exported.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't export this project.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (submitLock.current) return;
    const text = prompt.trim();
    if (
      !text &&
      attachments.length === 0 &&
      selectedFiles.length === 0 &&
      uploadedComposerAttachments.length === 0
    )
      return;
    submitLock.current = true;
    const target =
      active ||
      (/\b(video|film|edit|clip)\b/i.test(text)
        ? "video"
        : /\b(app|habit|mobile)\b/i.test(text)
          ? "app"
          : "website");
    const attachmentNames = [
      ...uploadedComposerAttachments.map((file) => file.name),
      ...selectedFiles.map((file) => file.name),
    ];
    const body =
      [
        text,
        attachmentNames.length
          ? `Attached files: ${attachmentNames.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n") || `Use these files: ${attachments.join(", ")}`;
    setBusy(true);
    setNotice("");
    try {
      if (!projectId) {
        const form = new FormData();
        form.append(
          "prompt",
          text || "Use the attached files as inspiration for a new project.",
        );
        form.append("projectType", target);
        for (const file of selectedFiles) form.append("files", file);
        const response = await fetch("/api/projects", {
          method: "POST",
          body: form,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message || "Couldn't create the project.");
        if (!result.project?.id)
          throw new Error("Project creation did not return a project ID.");
        setProjectId(result.project.id);
        setProjectName(result.project.name || "Project");
        setDrafts({ website: "", app: "", video: "" });
        setProjectFilesStatus("loading");
        if (result.generation?.message) setNotice(result.generation.message);
        setPrompt("");
        setAttachments([]);
        setSelectedFiles([]);
        router.push(`/project/${result.project.id}`);
        return;
      }
      const messageKey = JSON.stringify({ body, chatId: chatId || null });
      if (messageRequest.current?.key !== messageKey)
        messageRequest.current = { key: messageKey, id: crypto.randomUUID() };
      if (selectedFiles.length) {
        const form = new FormData();
        for (const file of selectedFiles) form.append("files", file);
        form.append(
          "requestId",
          attachmentRequestId.current ||
            (attachmentRequestId.current = crypto.randomUUID()),
        );
        const uploadResponse = await fetch(
          `/api/projects/${projectId}/attachments`,
          { method: "POST", body: form },
        );
        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok)
          throw new Error(
            uploadResult.message || "Couldn't save the attached files.",
          );
        const uploaded = Array.isArray(uploadResult.attachments)
          ? uploadResult.attachments
          : [];
        setUploadedComposerAttachments((current) => [
          ...current,
          ...uploaded.map((file: { id: string; name: string }) => ({
            id: file.id,
            name: file.name,
          })),
        ]);
        setSelectedFiles([]);
        attachmentRequestId.current = "";
      }
      const response = await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: body,
          chatId: chatId || undefined,
          requestId: messageRequest.current.id,
          generate: false,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't send your message.");
      setChatId(result.conversationId || chatId);
      setMessages((current) => ({
        ...current,
        [target]: [...(current[target] || []), { role: "user", body }],
      }));
      setNotice(
        result.generation?.message ||
          "Message saved. AI generation is unavailable in this local setup.",
      );
      messageRequest.current = null;
      setPrompt("");
      setAttachments([]);
      setUploadedComposerAttachments([]);
      setSelectedFiles([]);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "The request couldn't be completed.",
      );
    } finally {
      setBusy(false);
      submitLock.current = false;
    }
  }
  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      submit();
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setNotice("Copied to clipboard");
    } catch {
      setNotice("Copy isn’t available. Select and copy the link below.");
    }
  }
  function closeDialog() {
    dialogRef.current?.close();
    setDialog(null);
    setCopied(false);
  }

  const composerForm = (isNew: boolean) => (
    <form
      className={`${styles.composer} ${isNew ? styles.newComposer : styles.chatComposer}`}
      onSubmit={submit}
    >
      <textarea
        ref={composer}
        aria-label={isNew ? "Describe your project" : "Message Runly"}
        placeholder={
          isNew
            ? "Describe what you want to create…"
            : "Ask Runly to change anything…"
        }
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={onComposerKey}
        maxLength={10000}
      />
      {attachments.length > 0 && (
        <div className={styles.attachments}>
          {attachments.map((name) => (
            <span key={name}>
              {name}
              <button
                type="button"
                aria-label={`Remove ${name}`}
                onClick={() => {
                  setAttachments((current) =>
                    current.filter((item) => item !== name),
                  );
                  setSelectedFiles((current) =>
                    current.filter((file) => file.name !== name),
                  );
                  setUploadedComposerAttachments((current) =>
                    current.filter((file) => file.name !== name),
                  );
                  attachmentRequestId.current = "";
                }}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className={styles.composerTools}>
        <button
          className={styles.iconButton}
          type="button"
          aria-label="Attach files"
          title={
            projectId
              ? "Attach reference files to this project"
              : "Attach project files"
          }
          disabled={
            busy || (Boolean(projectId) && projectFilesStatus !== "ready")
          }
          onClick={() => fileInput.current?.click()}
        >
          <Icon name={isNew ? "newAttach" : "attach"} />
        </button>
        <label className={styles.model}>
          <span className={styles.srOnly}>Model</span>
          <select
            value={model}
            disabled={Boolean(projectId)}
            title={
              projectId
                ? "Model selection is unavailable while generation is disabled."
                : undefined
            }
            onChange={(event) => setModel(event.target.value)}
          >
            <option value="Auto">{isNew ? "Runly Auto" : "Auto"}</option>
            <option value="Fast">Fast</option>
            <option value="Thinking">Thinking</option>
          </select>
          {isNew && <Icon name="chevron" />}
        </label>
        <button
          className={styles.send}
          type="submit"
          aria-label={isNew ? "Create project" : "Send message"}
          disabled={busy || (!prompt.trim() && attachments.length === 0)}
        >
          <Icon name={isNew ? "newUp" : "up"} />
        </button>
      </div>
    </form>
  );

  return (
    <div className={styles.root}>
      <input
        className={styles.srOnly}
        ref={fileInput}
        type="file"
        multiple
        tabIndex={-1}
        aria-label="Choose project files"
        onChange={(event) => {
          const picked = Array.from(event.target.files || []);
          attachmentRequestId.current = "";
          const nextFiles = [...selectedFiles, ...picked];
          if (
            nextFiles.length > 5 ||
            nextFiles.some((file) => file.size > 8 * 1024 * 1024) ||
            nextFiles.reduce((sum, file) => sum + file.size, 0) >
              20 * 1024 * 1024
          ) {
            setNotice(
              "Choose up to five files, each 8 MB or smaller, with a 20 MB total limit.",
            );
            event.target.value = "";
            return;
          }
          setAttachments((current) => [
            ...new Set([...current, ...picked.map((file) => file.name)]),
          ]);
          setSelectedFiles(nextFiles);
          event.target.value = "";
        }}
      />
      {mobileNav && (
        <button
          className={styles.navScrim}
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside
        className={`${styles.sidebar} ${mobileNav ? styles.sidebarOpen : ""}`}
        aria-label="Workspace navigation"
      >
        <div className={styles.brandRow}>
          <Link href="/" className={styles.brand} aria-label="Runly home">
            <Mark />
            <span>Runly</span>
          </Link>
          <button
            className={styles.iconButton}
            aria-label="Search projects"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((current) => !current)}
          >
            <Icon name="search" />
          </button>
        </div>
        <button
          className={styles.newProject}
          onClick={() => openProject("new")}
        >
          <Icon name="plus" />
          <span>New project</span>
        </button>
        <nav className={styles.projectNav} aria-label="Your projects">
          <p>Your projects</p>
          {searchOpen && (
            <label className={styles.projectSearch}>
              <span className={styles.srOnly}>Search projects</span>
              <input
                autoFocus
                placeholder="Search projects…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                className={styles.iconButton}
                onClick={() => {
                  setQuery("");
                  setSearchOpen(false);
                }}
                aria-label="Close project search"
              >
                <X size={14} />
              </button>
            </label>
          )}
          {projects
            .filter((item) =>
              item.name.toLowerCase().includes(query.toLowerCase()),
            )
            .map((item) => (
              <button
                key={item.id}
                className={projectId === item.id ? styles.activeProject : ""}
                onClick={() => router.push(`/project/${item.id}`)}
                aria-current={projectId === item.id ? "page" : undefined}
              >
                <Icon name="globe" />
                <span>{item.name}</span>
              </button>
            ))}
          {query &&
            !projects.some((item) =>
              item.name.toLowerCase().includes(query.toLowerCase()),
            ) && <p className={styles.emptySearch}>No matching projects.</p>}
        </nav>
        <div className={styles.recent}>
          <p>{projectId ? "SAVED CHATS" : "YOUR PROJECTS"}</p>
          {projectId ? (
            <>
              {savedChats.slice(0, 6).map((chat) => (
                <button
                  key={chat.id}
                  disabled={busy}
                  onClick={() => void openSavedChat(chat.id)}
                >
                  {chat.title || "New chat"}
                </button>
              ))}
              <p>VERSION HISTORY</p>
              {savedVersions.slice(0, 4).map((version) => (
                <button
                  key={version.id}
                  disabled={busy}
                  onClick={() => void restoreVersion(version.id)}
                >
                  {version.description || "Saved version"}
                </button>
              ))}
            </>
          ) : (
            <span>
              {projects.length
                ? `${projects.length} saved projects`
                : "Your saved projects will appear here."}
            </span>
          )}
        </div>
        <button className={styles.account} onClick={() => setDialog("account")}>
          <span className={styles.avatar}>
            {(userName || "A").slice(0, 1).toUpperCase()}
          </span>
          <span>
            <strong>{userName || "Your account"}</strong>
            <small>Account workspace</small>
          </span>
        </button>
      </aside>
      <main className={styles.main}>
        <header
          className={`${styles.toolbar} ${active && mobilePane === "preview" ? styles.mobilePreviewToolbar : ""}`}
        >
          <button
            className={`${styles.iconButton} ${styles.mobileMenu}`}
            aria-label="Open workspace navigation"
            onClick={() => setMobileNav(true)}
          >
            <Menu size={20} />
          </button>
          <span className={styles.mobileBrand}>
            <Mark size={28} />
            <span>Runly</span>
          </span>
          <span className={styles.mobileProjectName}>
            {projectName ||
              (active === "website"
                ? "Offscript"
                : active === "app"
                  ? "Daylight"
                  : "Cloud nine")}
          </span>
          <button
            className={`${styles.iconButton} ${styles.mobileNew}`}
            aria-label="New project"
            onClick={() => openProject("new")}
          >
            <Plus size={20} />
          </button>
          <h1>{projectName || project?.name || "New project"}</h1>
          {active && (
            <>
              <span className={styles.saved}>
                {dirty ? "Unsaved changes" : "Saved"}
              </span>
              <div className={styles.toolbarActions}>
                <button
                  className={styles.secondary}
                  onClick={() => void loadShare()}
                >
                  Share
                </button>
                <button
                  className={styles.primary}
                  onClick={() => setDialog("publish")}
                >
                  {active === "video" ? "Export" : "Publish"}
                </button>
              </div>
            </>
          )}
        </header>
        {active && (
          <div
            className={styles.mobileViewTabs}
            role="tablist"
            aria-label="Mobile workspace view"
          >
            <button
              role="tab"
              aria-selected={mobilePane === "chat"}
              onClick={() => setMobilePane("chat")}
            >
              Chat
            </button>
            <button
              role="tab"
              aria-selected={mobilePane === "preview"}
              onClick={() => {
                setMobilePane("preview");
                setTab("preview");
              }}
            >
              Preview
            </button>
          </div>
        )}
        {view === "new" ? (
          <section className={styles.welcome} aria-labelledby="welcome-heading">
            <Mark size={56} />
            <h2 id="welcome-heading">What will you make today?</h2>
            <p>A video. A website. An app. Start with an idea.</p>
            {composerForm(true)}
            <div className={styles.starters}>
              <button onClick={() => startWith("website")}>
                Build a website
              </button>
              <button onClick={() => startWith("app")}>Create an app</button>
              <button onClick={() => startWith("video")}>Edit a video</button>
            </div>
            <small>Pick a starting point, or bring your own files.</small>
          </section>
        ) : (
          <div
            className={`${styles.workspace} ${mobilePane === "preview" ? styles.mobileShowingPreview : ""}`}
          >
            <section className={styles.chat} aria-label="AI conversation">
              <div className={styles.panelHeader}>
                <h2>Chat</h2>
                <button
                  className={styles.iconButton}
                  aria-label="Start a new chat"
                  onClick={() => void startNewChat()}
                >
                  <Icon name="chatPlus" />
                </button>
              </div>
              <div className={styles.conversation} ref={conversation}>
                {freshChat ? (
                  <div className={styles.emptyConversation}>
                    <Mark size={30} />
                    <h3>Start a new conversation</h3>
                    <p>Ask Runly about your project.</p>
                  </div>
                ) : projectId ? (
                  <>
                    {conversationMessages.map((message, index) => (
                      <div
                        key={index}
                        className={
                          message.role === "user"
                            ? styles.userMessage
                            : styles.followup
                        }
                      >
                        {message.body}
                      </div>
                    ))}
                    {!conversationMessages.length && (
                      <div className={styles.emptyConversation}>
                        <Mark size={30} />
                        <h3>No saved messages yet</h3>
                        <p>
                          Ask Runly about this project. Generation is currently
                          unavailable.
                        </p>
                      </div>
                    )}
                    <p className={styles.dialogNote}>
                      AI generation is unavailable in this local setup. Your
                      project and messages are saved.
                    </p>
                  </>
                ) : (
                  <>
                    <div className={styles.userMessage}>
                      {messages[active!]?.[0]?.body || fixture!.prompt}
                    </div>
                    <div className={styles.assistantName}>
                      <Mark size={24} />
                      <strong>Runly</strong>
                    </div>
                    <div className={styles.assistantResponse}>
                      <p>
                        <span className={styles.desktopCopy}>
                          {fixture!.response}
                        </span>
                        <span className={styles.mobileCopy}>
                          {active === "website"
                            ? "Here’s a first direction: editorial typography, a muted olive palette, and plenty of room for your work."
                            : fixture!.response}
                        </span>
                      </p>
                      <ul>
                        {fixture!.features.map((item) => (
                          <li key={item}>
                            <Icon name="check" />
                            {item}
                          </li>
                        ))}
                      </ul>
                      <p>
                        Take a look at the preview. What would you like to
                        change?
                      </p>
                    </div>
                    <div className={styles.mobileResult}>
                      <strong>{projectName || project?.name}</strong>
                      <span>
                        Version {projectId ? versionCount : versions[active!]} ·{" "}
                        {projectId ? "Saved project" : "Preview"}
                      </span>
                      <button
                        onClick={() => {
                          setMobilePane("preview");
                          setTab("preview");
                        }}
                      >
                        Open preview
                      </button>
                    </div>
                    <p
                      className={`${styles.mobileResultQuestion} ${styles.mobileQuestion}`}
                    >
                      What would you like to change?
                    </p>
                    <button
                      className={styles.checkpoint}
                      onClick={() => {
                        setTab("preview");
                        setNotice(
                          `Viewing version ${projectId ? versionCount : versions[active!]}`,
                        );
                      }}
                    >
                      <strong>
                        Version {projectId ? versionCount : versions[active!]}
                      </strong>
                      <span>
                        {projectId ? "Saved project history" : "Preview only"}
                      </span>
                    </button>
                    <button
                      className={`${styles.iconButton} ${styles.copyResponse}`}
                      aria-label="Copy Runly response"
                      onClick={() => void copy(fixture!.response)}
                    >
                      <Icon name="copy" />
                    </button>
                    {(messages[active!] || [])
                      .slice(1)
                      .map((message, index) => (
                        <div
                          key={index}
                          className={
                            message.role === "user"
                              ? styles.userMessage
                              : styles.followup
                          }
                        >
                          {message.body}
                        </div>
                      ))}
                  </>
                )}
              </div>
              <div className={styles.chatBottom}>
                {composerForm(false)}
                <p>Review AI-generated work before publishing.</p>
              </div>
            </section>
            <section
              className={styles.previewPanel}
              aria-label="Preview and tools"
            >
              <div className={styles.previewHeader}>
                <div
                  className={styles.tabs}
                  role="tablist"
                  aria-label="Project view"
                >
                  <button
                    role="tab"
                    id="workspace-preview-tab"
                    aria-selected={tab === "preview"}
                    aria-controls="workspace-preview"
                    onClick={() => setTab("preview")}
                  >
                    Preview
                  </button>
                  <button
                    role="tab"
                    id="workspace-code-tab"
                    aria-selected={tab === "code" || tab === "timeline"}
                    aria-controls={
                      active === "video" ? "video-timeline" : "workspace-code"
                    }
                    onClick={() => {
                      if (active === "video") {
                        setTab("timeline");
                        document
                          .getElementById("video-timeline")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "nearest",
                          });
                      } else setTab("code");
                    }}
                  >
                    {active === "video" ? "Timeline" : "Code"}
                  </button>
                </div>
                {active === "video" ? (
                  <span className={styles.videoFormat}>16:9 · 1080p</span>
                ) : (
                  <label className={styles.device}>
                    <span className={styles.srOnly}>Preview size</span>
                    <select
                      value={device}
                      onChange={(event) => setDevice(event.target.value)}
                    >
                      <option>Desktop</option>
                      <option>Tablet</option>
                      <option>Mobile</option>
                    </select>
                    <span>·&nbsp; 100%</span>
                  </label>
                )}
              </div>
              {tab === "code" ? (
                <div
                  role="tabpanel"
                  id="workspace-code"
                  aria-labelledby="workspace-code-tab"
                  className={styles.codePanel}
                >
                  <div className={styles.codeFile}>
                    {projectId &&
                    runtimeFiles.some((item) => item.kind !== "folder") ? (
                      <label>
                        <span className={styles.srOnly}>Project file</span>
                        <select
                          value={activeFilePath}
                          onChange={(event) => {
                            const path = event.target.value;
                            const file = runtimeFiles.find(
                              (item) => item.path === path,
                            );
                            setActiveFilePath(path);
                            if (file)
                              setDrafts((old) => ({
                                ...old,
                                [active || "website"]: file.content || "",
                              }));
                            setDirty(false);
                          }}
                        >
                          {runtimeFiles
                            .filter((item) => item.kind !== "folder")
                            .map((item) => (
                              <option key={item.path} value={item.path}>
                                {item.path}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : (
                      <span>
                        {activeFilePath ||
                          (projectId
                            ? "index.html"
                            : active === "video"
                              ? "video.config.ts"
                              : "app/page.tsx")}
                      </span>
                    )}
                    <button
                      className={styles.secondary}
                      disabled={
                        !dirty ||
                        busy ||
                        (Boolean(projectId) && projectFilesStatus !== "ready")
                      }
                      onClick={() => void saveProjectFile()}
                    >
                      Save
                    </button>
                  </div>
                  <textarea
                    aria-label="Project source code"
                    spellCheck={false}
                    value={drafts[active!]}
                    readOnly={
                      Boolean(projectId) && projectFilesStatus !== "ready"
                    }
                    onChange={(event) => {
                      setDrafts((current) => ({
                        ...current,
                        [active!]: event.target.value,
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
                          : "Changes save to this project."
                      : "Create a project to save files."}
                  </p>
                  {savedAttachments.length > 0 && (
                    <div aria-label="Attached reference files">
                      <strong>Reference files</strong>
                      {savedAttachments.map((file) => (
                        <a
                          key={file.id}
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {file.name} · {(file.size / 1024).toFixed(0)} KB
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div
                  role="tabpanel"
                  id="workspace-preview"
                  aria-labelledby="workspace-preview-tab"
                  className={`${styles.previewBody} ${active === "video" ? styles.videoPreview : ""} ${device === "Mobile" ? styles.mobilePreview : device === "Tablet" ? styles.tabletPreview : ""}`}
                >
                  {projectId ? (
                    <div className={styles.emptyConversation}>
                      <h2>Live preview unavailable</h2>
                      <p>
                        The local development setup has no sandbox runtime. Your
                        saved source files are available in the Code and Files
                        panels.
                      </p>
                    </div>
                  ) : active === "website" ? (
                    <div className={styles.websitePreview}>
                      <div className={styles.siteHeader}>
                        <strong>offscript®</strong>
                        <nav aria-label="Offscript preview">
                          <button onClick={() => setSiteSection("work")}>
                            Work
                          </button>
                          <button onClick={() => setSiteSection("studio")}>
                            Studio
                          </button>
                          <button onClick={() => setSiteSection("contact")}>
                            Contact
                          </button>
                        </nav>
                      </div>
                      {siteSection === "home" ? (
                        <>
                          <h2>
                            Good ideas
                            <br />
                            deserve to
                            <br />
                            stand out.
                          </h2>
                          <div className={styles.siteBottom}>
                            <p>
                              Independent design for people
                              <br />
                              doing things differently.
                            </p>
                            <button onClick={() => setSiteSection("work")}>
                              Explore our work
                            </button>
                          </div>
                          <small>
                            BRAND STRATEGY&nbsp;&nbsp; / &nbsp;&nbsp;DIGITAL
                            EXPERIENCES
                          </small>
                        </>
                      ) : (
                        <div className={styles.siteDetail}>
                          <button onClick={() => setSiteSection("home")}>
                            ← Back
                          </button>
                          <h2>
                            {siteSection === "work"
                              ? "Selected work."
                              : siteSection === "studio"
                                ? "A different perspective."
                                : "Let’s make something."}
                          </h2>
                          <p>
                            {siteSection === "work"
                              ? "Brand strategy. Digital experiences. Ideas with a point of view."
                              : siteSection === "studio"
                                ? "We’re Offscript. An independent creative studio for people doing things differently."
                                : "Tell us what you have in mind."}
                          </p>
                          {siteSection === "contact" && (
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                setNotice(
                                  "Thanks — your message is ready in this preview.",
                                );
                              }}
                            >
                              <input
                                required
                                type="email"
                                aria-label="Your email"
                                placeholder="Your email"
                              />
                              <textarea
                                required
                                aria-label="Your message"
                                placeholder="Your idea"
                              />
                              <button>Send message</button>
                            </form>
                          )}
                        </div>
                      )}
                    </div>
                  ) : active === "app" ? (
                    <div className={styles.appCanvas}>
                      <div className={styles.phone}>
                        <span className={styles.phoneTime}>9:41</span>
                        <h2>Daylight</h2>
                        <p>A little better, every day.</p>
                        <h3>Your week</h3>
                        <div
                          className={styles.week}
                          aria-label="Weekly activity"
                        >
                          <div>
                            {[34, 58, 48, 80, 66, 96, 20].map(
                              (height, index) => (
                                <span
                                  key={index}
                                  style={{ height }}
                                  className={index === 5 ? styles.todayBar : ""}
                                />
                              ),
                            )}
                          </div>
                          <div>
                            {["M", "T", "W", "T", "F", "S", "S"].map(
                              (day, index) => (
                                <span key={index}>{day}</span>
                              ),
                            )}
                          </div>
                        </div>
                        <h4>TODAY</h4>
                        <div className={styles.habits}>
                          {[
                            "Morning walk",
                            "Read 10 pages",
                            "Make something",
                          ].map((habit, index) => (
                            <button
                              key={habit}
                              aria-pressed={habits[index]}
                              onClick={() =>
                                setHabits((current) =>
                                  current.map((value, item) =>
                                    item === index ? !value : value,
                                  ),
                                )
                              }
                            >
                              <Icon
                                name={
                                  habits[index] ? "habitCheck" : "habitPlus"
                                }
                              />
                              {habit}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.videoCanvas}>
                      <div className={styles.videoScreen}>
                        <Image
                          src="/figma/workspace/3a6d8.png"
                          alt="Soft sunlit clouds framing a clear blue sky"
                          fill
                          sizes="(max-width:760px) 90vw, 60vw"
                        />
                        <p>
                          a little closer
                          <br />
                          to the sky.
                        </p>
                        <span>OFFLINE WEEKENDS</span>
                      </div>
                      <div className={styles.videoControls}>
                        <button
                          className={styles.iconButton}
                          aria-label={playing ? "Pause video" : "Play video"}
                          onClick={() => setPlaying((current) => !current)}
                        >
                          {playing ? <Pause size={22} /> : <Icon name="play" />}
                        </button>
                        <span>
                          00:{String(videoPosition).padStart(2, "0")} / 00:15
                        </span>
                        <input
                          type="range"
                          aria-label="Video position"
                          min="0"
                          max="15"
                          value={videoPosition}
                          onChange={(event) =>
                            setVideoPosition(Number(event.target.value))
                          }
                        />
                      </div>
                      <div className={styles.timeline} id="video-timeline">
                        <div className={styles.timelineRuler}>
                          {["0:00", "0:05", "0:10", "0:15"].map((time) => (
                            <span key={time}>{time}</span>
                          ))}
                        </div>
                        <div className={styles.timelineTracks}>
                          <div className={styles.videoTrack}>
                            <span>Video</span>
                            <div className={styles.videoClips}>
                              {[1, 2, 3, 4, 5].map((clip) => (
                                <button
                                  key={clip}
                                  onClick={() =>
                                    setVideoPosition((clip - 1) * 3)
                                  }
                                  aria-label={`Seek to clip ${clip}`}
                                >
                                  <Image
                                    src="/figma/workspace/3a6d8.png"
                                    alt=""
                                    width={132}
                                    height={63}
                                  />
                                  <span>0{clip}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className={styles.audioTrack}>
                            <span>Audio</span>
                            <div>Soft mornings · instrumental</div>
                          </div>
                          <span
                            className={styles.playhead}
                            style={{
                              left: `calc(104px + (100% - 104px) * ${videoPosition / 15})`,
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {active === "website" && (
                    <p className={styles.previewDomain}>{fixture!.domain}</p>
                  )}
                </div>
              )}
              <button
                className={styles.mobilePublish}
                onClick={() => setDialog("publish")}
              >
                {active === "video"
                  ? "Export video"
                  : active === "app"
                    ? "Publish app"
                    : "Publish website"}
              </button>
            </section>
          </div>
        )}
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
      </main>
      {dialog && (
        <dialog
          className={styles.dialog}
          ref={dialogRef}
          onCancel={closeDialog}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDialog();
          }}
        >
          <div className={styles.dialogHeading}>
            <h2>
              {dialog === "share"
                ? "Share your project"
                : dialog === "publish"
                  ? active === "video"
                    ? "Export your video"
                    : "Publish your project"
                  : "Personal workspace"}
            </h2>
            <button
              className={styles.iconButton}
              aria-label="Close dialog"
              onClick={closeDialog}
            >
              <X size={20} />
            </button>
          </div>
          {dialog === "account" ? (
            <div className={styles.accountLinks}>
              <p>{userName || "Signed-in account"}</p>
              <Link href="/settings">Account settings</Link>
              <Link href="/settings/billing">Billing and plans</Link>
              {projectId && (
                <Link href={`/project/${projectId}?view=editor`}>
                  Open full editor
                </Link>
              )}
              <Link href="/support">Help and support</Link>
            </div>
          ) : dialog === "share" ? (
            <>
              <p>
                Manage a separate public link to this project’s saved source
                snapshot.
              </p>
              <label className={styles.shareLink}>
                <span className={styles.srOnly}>Project preview link</span>
                <input
                  readOnly
                  value={
                    shareUrl
                      ? new URL(shareUrl, window.location.origin).toString()
                      : "Sharing is off"
                  }
                />
                <button
                  className={styles.secondary}
                  disabled={!shareUrl}
                  onClick={() =>
                    void copy(
                      new URL(shareUrl, window.location.origin).toString(),
                    )
                  }
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? "Copied" : "Copy link"}
                </button>
              </label>
              <button
                className={shareEnabled ? styles.secondary : styles.primary}
                disabled={busy}
                onClick={() => void toggleShare()}
              >
                {busy
                  ? "Saving…"
                  : shareEnabled
                    ? "Disable sharing"
                    : "Enable sharing"}
              </button>
              <p className={styles.dialogNote}>
                {shareEnabled
                  ? "Anyone with this link can view the saved source snapshot. It expires after 7 days."
                  : publishedUrl
                    ? "The static site is public at the published URL; its source stays private until you enable source sharing."
                    : "The source snapshot is private until source sharing is enabled."}
              </p>
            </>
          ) : (
            <>
              <p>{projectName || project?.name} is saved in your workspace.</p>
              <p className={styles.dialogNote}>
                {active === "video"
                  ? "Video rendering is unavailable. You can download the saved project source as JSON."
                  : "Publishing makes the static site public, while project source stays private. Publishing replaces any active source-share link. A root index.html is required; framework builds need the unavailable project runtime."}
              </p>
              {publishedUrl && (
                <p>
                  Published:{" "}
                  <a href={publishedUrl} target="_blank" rel="noreferrer">
                    {publishedUrl}
                  </a>
                </p>
              )}
              <div className={styles.toolbarActions}>
                {active === "video" ? (
                  <button
                    className={styles.primary}
                    disabled={busy}
                    onClick={() => void exportProject()}
                  >
                    {busy ? "Exporting…" : "Download source JSON"}
                  </button>
                ) : (
                  <button
                    className={styles.primary}
                    disabled={busy || !projectId}
                    onClick={() => void publishProject()}
                  >
                    {busy ? "Publishing…" : "Publish static site"}
                  </button>
                )}
                <button className={styles.secondary} onClick={closeDialog}>
                  Close
                </button>
              </div>
            </>
          )}
        </dialog>
      )}
    </div>
  );
}
