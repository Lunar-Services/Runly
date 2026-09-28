"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  Blocks,
  ChevronDown,
  ChevronRight,
  Code2,
  Eye,
  FileCode2,
  FilePlus2,
  FolderOpen,
  Folder,
  Gauge,
  GitBranch,
  Image as ImageIcon,
  Mic,
  Moon,
  PanelBottom,
  Pencil,
  Play,
  PlusCircle,
  RotateCw,
  Settings,
  MessageSquare,
  Plug,
  Plus,
  Sparkles,
  SquareTerminal,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "./theme-provider";
import { useProjectRuntime, type WorkspaceFile } from "./use-project-runtime";
import { WorkspaceTerminal } from "./workspace-terminal";

type Project = { id: string; name: string; status: string };
type ProjectSummary = Project & { updated_at?: string };
type ChatSummary = { id: string; title: string };
type DayPart = "Morning" | "Afternoon" | "Evening";
type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  body: string;
  created_at: string;
};
type ProjectFile = WorkspaceFile;
type ExplorerNode = {
  name: string;
  path: string;
  kind: "folder" | "file";
  children: ExplorerNode[];
};
type ExplorerMenu = { x: number; y: number; parentPath: string };
type ChatMenu = { x: number; y: number; chat: ChatSummary };

function folderPathsFor(files: ProjectFile[], folders: string[]) {
  const paths = new Set<string>();
  for (const folder of folders) {
    const parts = folder.split("/").filter(Boolean);
    let path = "";
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      paths.add(path);
    }
  }
  for (const file of files) {
    const parts = file.path.split("/").slice(0, -1);
    let path = "";
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      paths.add(path);
    }
  }
  return [...paths];
}

function buildExplorerTree(files: ProjectFile[], folders: string[]) {
  const root: ExplorerNode[] = [];
  const allFolders = folderPathsFor(files, folders);
  const ensureFolder = (path: string) => {
    let list = root;
    let currentPath = "";
    let node: ExplorerNode | undefined;
    for (const part of path.split("/").filter(Boolean)) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      node = list.find((item) => item.kind === "folder" && item.name === part);
      if (!node) {
        node = { name: part, path: currentPath, kind: "folder", children: [] };
        list.push(node);
      }
      list = node.children;
    }
  };
  for (const folder of allFolders) ensureFolder(folder);
  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    const name = parts.pop();
    if (!name) continue;
    const parent = parts.join("/");
    ensureFolder(parent);
    const list = parent
      ? parent
          .split("/")
          .reduce(
            (items, part) =>
              items.find((item) => item.name === part)?.children || [],
            root,
          )
      : root;
    list.push({ name, path: file.path, kind: "file", children: [] });
  }
  const sortNodes = (nodes: ExplorerNode[]) => {
    nodes.sort((a, b) =>
      a.kind === b.kind
        ? a.name.localeCompare(b.name)
        : a.kind === "folder"
          ? -1
          : 1,
    );
    nodes.forEach((node) => sortNodes(node.children));
  };
  sortNodes(root);
  return root;
}

function devCommandFor(files: ProjectFile[]) {
  const manifests = files
    .filter((file) => file.path.split("/").at(-1) === "package.json")
    .sort((a, b) => a.path.length - b.path.length);
  for (const manifest of manifests) {
    try {
      const value = JSON.parse(manifest.content);
      if (typeof value.scripts?.dev !== "string") continue;
      const directory = manifest.path.split("/").slice(0, -1).join("/");
      const prefix = directory
        ? `--prefix '${directory.replaceAll("'", "'\\''")}' `
        : "";
      const dependencies = {
        ...value.dependencies,
        ...value.devDependencies,
      };
      const directoryArg = directory
        ? `'${directory.replaceAll("'", "'\\''")}'`
        : ".";
      const installIfNeeded = Object.keys(dependencies).length
        ? `if [ ! -d ${directoryArg}/node_modules ]; then npm install ${prefix}|| exit; fi; `
        : "";
      const hostArgs = dependencies.next
        ? " -- --hostname 0.0.0.0 --port 3000"
        : dependencies.vite
          ? " -- --host 0.0.0.0 --port 3000"
          : "";
      return `${installIfNeeded}npm ${prefix}run dev${hostArgs}`;
    } catch {
      // Ignore invalid package manifests and look for another app in the project.
    }
  }
  return null;
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { darkTheme, toggleTheme } = useTheme();
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [userName, setUserName] = useState("there");
  const [dayPart, setDayPart] = useState<DayPart | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    new Set(),
  );
  const [explorerMenu, setExplorerMenu] = useState<ExplorerMenu | null>(null);
  const [chatMenu, setChatMenu] = useState<ChatMenu | null>(null);
  const [deletingChat, setDeletingChat] = useState<ChatSummary | null>(null);
  const [deletingChatBusy, setDeletingChatBusy] = useState(false);
  const [draggedFile, setDraggedFile] = useState("");
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [activePath, setActivePath] = useState("");
  const [workspaceView, setWorkspaceView] = useState<
    "chat" | "code" | "preview" | "terminal"
  >("chat");
  const [bottomPanel, setBottomPanel] = useState<"terminal" | "logs">(
    "terminal",
  );
  const [bottomPanelHeight, setBottomPanelHeight] = useState(190);
  const [previewReload, setPreviewReload] = useState(0);
  const previewAppStart = useRef(false);
  const workspaceToolStart = useRef<string | null>(null);
  const panelResize = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
  } | null>(null);
  const [prompt, setPrompt] = useState("");
  const pendingMessage = useRef<{
    id: string;
    text: string;
    chat: string | null;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [previewNeedsRestart, setPreviewNeedsRestart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [runCommand, setRunCommand] = useState("npm run dev");
  const [legacyFiles, setLegacyFiles] = useState<ProjectFile[]>([]);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newItemKind, setNewItemKind] = useState<"file" | "folder">("file");
  const [newFilePath, setNewFilePath] = useState("README.md");
  const [newFileError, setNewFileError] = useState("");
  const [renamingChat, setRenamingChat] = useState<ChatSummary | null>(null);
  const [renameChatTitle, setRenameChatTitle] = useState("");
  const [renameChatError, setRenameChatError] = useState("");
  const [renamingChatBusy, setRenamingChatBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState<"view" | "help" | null>(null);
  const activeChatRef = useRef(activeChatId);
  useEffect(() => {
    activeChatRef.current = activeChatId;
  }, [activeChatId]);
  const runtime = useProjectRuntime(projectId, (frame) => {
    if (frame.type === "app.status") {
      if (typeof frame.error === "string") {
        setError(frame.error);
        setPreviewNeedsRestart(frame.restartRequired === true);
      } else if (typeof frame.previewUrl === "string") {
        setError("");
        setPreviewNeedsRestart(false);
      }
    }
    if (frame.type === "agent.text" && frame.chatId === activeChatRef.current) {
      const message = {
        id: `agent-${frame.jobId}`,
        role: "assistant" as const,
        body: String(frame.text),
        created_at: new Date().toISOString(),
      };
      setMessages((current) => [
        ...current.filter((item) => item.id !== message.id),
        message,
      ]);
    }
    if (
      frame.type === "job.status" &&
      ["completed", "failed"].includes(String(frame.state)) &&
      frame.chatId === activeChatRef.current
    ) {
      const chatId = activeChatRef.current;
      void fetch(`/api/projects/${projectId}?chat=${chatId}`)
        .then((response) => response.json())
        .then((data) => {
          if (chatId === activeChatRef.current && Array.isArray(data.messages))
            setMessages(data.messages);
        });
    }
  });
  const {
    files,
    folders,
    mode: runtimeMode,
    state: runtimeState,
    control: runtimeControl,
    request: runtimeRequest,
    appRunning,
    previewUrl,
    agentBusy,
    saving,
  } = runtime;
  const runtimeStatus =
    runtimeState === "starting" || runtimeState === "connecting"
      ? "Starting"
      : runtimeState === "ready"
        ? agentBusy || appRunning || saving || workspaceView !== "chat"
          ? "Running"
          : "Idle"
        : "Inactive";
  const newFileInput = useRef<HTMLInputElement>(null);
  const renameChatInput = useRef<HTMLInputElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);

  function resizeBottomPanel(height: number) {
    const maxHeight = Math.max(150, window.innerHeight - 44 - 48 - 140);
    setBottomPanelHeight(Math.max(120, Math.min(maxHeight, height)));
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      const hour = new Date().getHours();
      setDayPart(hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening");
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const needsWorkspace =
      workspaceView === "code" ||
      workspaceView === "terminal" ||
      workspaceView === "preview";
    if (!needsWorkspace) {
      workspaceToolStart.current = null;
      return;
    }
    if (runtimeState === "ready") {
      workspaceToolStart.current = workspaceView;
      return;
    }
    if (runtimeState !== "stopped") return;

    // Entering a workspace-backed tool starts it on demand. If the server
    // later idles it, the next interaction requests it again.
    const shouldStartOnEnter = workspaceToolStart.current !== workspaceView;
    let requested = false;
    workspaceToolStart.current = workspaceView;
    const startWorkspace = () => {
      if (requested || document.visibilityState !== "visible") return;
      requested = true;
      setError("");
      void runtimeControl("start").catch((reason) => {
        requested = false;
        setError(
          reason instanceof Error
            ? reason.message
            : "Couldn't start the project workspace.",
        );
      });
    };
    if (shouldStartOnEnter) startWorkspace();
    window.addEventListener("pointerdown", startWorkspace, { passive: true });
    window.addEventListener("keydown", startWorkspace);
    window.addEventListener("input", startWorkspace);
    return () => {
      window.removeEventListener("pointerdown", startWorkspace);
      window.removeEventListener("keydown", startWorkspace);
      window.removeEventListener("input", startWorkspace);
    };
  }, [workspaceView, runtimeMode, runtimeState, runtimeControl]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects", { signal: controller.signal })
      .then((response) => response.json())
      .then((result) =>
        setProjects(Array.isArray(result.projects) ? result.projects : []),
      )
      .catch(() => undefined);
    const requestedChat = new URLSearchParams(window.location.search).get(
      "chat",
    );
    fetch(
      `/api/projects/${projectId}${requestedChat ? `?chat=${encodeURIComponent(requestedChat)}` : ""}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        return result;
      })
      .then((result) => {
        setProject(result.project);
        setUserName(result.userName || "there");
        setChats(Array.isArray(result.chats) ? result.chats : []);
        setActiveChatId(result.conversationId || null);
        setMessages(result.messages);
        try {
          const stored = JSON.parse(
            localStorage.getItem(`runly:files:v2:${projectId}`) || "[]",
          );
          if (Array.isArray(stored)) setLegacyFiles(stored);
        } catch {
          /* A damaged legacy cache does not prevent opening the project. */
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Couldn't load the project.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId]);

  useEffect(() => {
    if (newFileOpen) newFileInput.current?.focus();
  }, [newFileOpen]);
  useEffect(() => {
    if (renamingChat) renameChatInput.current?.focus();
  }, [renamingChat]);
  useEffect(() => {
    if (!explorerMenu && !chatMenu) return;
    function closeMenu(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExplorerMenu(null);
        setChatMenu(null);
      }
    }
    window.addEventListener("keydown", closeMenu);
    return () => window.removeEventListener("keydown", closeMenu);
  }, [explorerMenu, chatMenu]);
  useEffect(() => {
    function handleWorkspaceShortcut(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setWorkspaceView((current) => (current === "code" ? "chat" : "code"));
      }
      if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        setError("");
        setPreviewNeedsRestart(false);
        setWorkspaceView((current) =>
          current === "preview" ? "chat" : "preview",
        );
      }
    }
    window.addEventListener("keydown", handleWorkspaceShortcut);
    return () => window.removeEventListener("keydown", handleWorkspaceShortcut);
  }, []);

  useEffect(() => {
    if (workspaceView !== "preview") {
      previewAppStart.current = false;
      return;
    }
    if (runtimeState === "stopped") previewAppStart.current = false;
    if (runtimeState !== "ready") return;
    if (appRunning || previewUrl || previewAppStart.current) return;
    const command = devCommandFor(files);
    if (!command) return;
    previewAppStart.current = true;
    void runtimeRequest("app.start", { command }).catch((reason) => {
      previewAppStart.current = false;
      setError(
        reason instanceof Error ? reason.message : "Couldn't start preview.",
      );
    });
  }, [
    workspaceView,
    runtimeMode,
    runtimeState,
    appRunning,
    previewUrl,
    runtimeRequest,
    files,
    previewReload,
  ]);

  useEffect(() => {
    if (workspaceView !== "preview" || !appRunning || previewUrl) return;
    const timeout = window.setTimeout(() => {
      setPreviewNeedsRestart(true);
      setError(
        "The app is running, but Preview did not receive an address. Check Console, or restart the workspace to enable Preview forwarding.",
      );
    }, 180_000);
    return () => window.clearTimeout(timeout);
  }, [workspaceView, appRunning, previewUrl]);

  const activeFile = files.find((file) => file.path === activePath);
  function openFile(path: string) {
    setActivePath(path);
    setWorkspaceView("code");
  }

  function openNewItem(kind: "file" | "folder", parentPath = "") {
    setExplorerMenu(null);
    setNewItemKind(kind);
    setNewFilePath(
      `${parentPath ? `${parentPath}/` : ""}${kind === "file" ? "README.md" : "new-folder"}`,
    );
    setNewFileError("");
    setNewFileOpen(true);
  }

  function addFile(parentPath = "") {
    openNewItem("file", parentPath);
  }

  function addFolder(parentPath = "") {
    openNewItem("folder", parentPath);
  }

  async function createFile(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const path = newFilePath
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "");
    if (!path) {
      setNewFileError(`Enter a ${newItemKind} path.`);
      return;
    }
    if (
      path.split("/").some((part) => !part || part === "." || part === "..")
    ) {
      setNewFileError("Use a valid relative path without . or .. segments.");
      return;
    }
    const alreadyExists =
      newItemKind === "file"
        ? folderPathsFor(files, folders).some(
            (folder) => folder.toLowerCase() === path.toLowerCase(),
          ) ||
          files.some((file) => file.path.toLowerCase() === path.toLowerCase())
        : files.some(
            (file) => file.path.toLowerCase() === path.toLowerCase(),
          ) ||
          folders.some((folder) => folder.toLowerCase() === path.toLowerCase());
    if (alreadyExists) {
      setNewFileError(`An item with this path already exists.`);
      return;
    }
    try {
      await runtime.request(newItemKind === "folder" ? "mkdir" : "write", {
        path,
        content: "",
        hash: "",
        create: true,
      });
      setExpandedFolders(
        (current) =>
          new Set([
            ...current,
            ...folderPathsFor([], [path.split("/").slice(0, -1).join("/")]),
          ]),
      );
      if (newItemKind === "file") openFile(path);
      setNewFileOpen(false);
    } catch (reason) {
      setNewFileError(
        reason instanceof Error ? reason.message : "Couldn't create this item.",
      );
    }
  }

  function showExplorerMenu(
    event: React.MouseEvent,
    path = "",
    kind: "folder" | "file" | "root" = "root",
  ) {
    event.preventDefault();
    const parentPath =
      kind === "folder"
        ? path
        : kind === "file"
          ? path.split("/").slice(0, -1).join("/")
          : "";
    setExplorerMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 205)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 112)),
      parentPath,
    });
    setChatMenu(null);
  }

  function showChatMenu(event: React.MouseEvent, chat: ChatSummary) {
    event.preventDefault();
    setExplorerMenu(null);
    setChatMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 205)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 112)),
      chat,
    });
  }

  function startRenamingChat(chat: ChatSummary) {
    setChatMenu(null);
    setRenameChatTitle(chat.title);
    setRenameChatError("");
    setRenamingChat(chat);
  }

  async function saveChatRename(event: React.FormEvent) {
    event.preventDefault();
    if (!renamingChat || !renameChatTitle.trim() || renamingChatBusy) return;
    setRenamingChatBusy(true);
    setRenameChatError("");
    try {
      const response = await fetch(
        `/api/projects/${projectId}/chats/${renamingChat.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: renameChatTitle.trim() }),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setChats((current) =>
        current.map((chat) =>
          chat.id === renamingChat.id ? result.chat : chat,
        ),
      );
      setRenamingChat(null);
    } catch (reason) {
      setRenameChatError(
        reason instanceof Error ? reason.message : "Couldn't rename this chat.",
      );
    } finally {
      setRenamingChatBusy(false);
    }
  }

  async function deleteChat(chat: ChatSummary) {
    setDeletingChatBusy(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/chats/${chat.id}`,
        { method: "DELETE" },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      const remaining = chats.filter((item) => item.id !== chat.id);
      setChats(remaining);
      if (activeChatId !== chat.id) return;
      if (remaining[0]) {
        await selectChat(remaining[0]);
      } else {
        setActiveChatId(null);
        setMessages([]);
        router.replace(`/project/${projectId}`);
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Couldn't delete this chat.",
      );
    } finally {
      setDeletingChat(null);
      setDeletingChatBusy(false);
    }
  }

  async function moveFileToFolder(sourcePath: string, targetFolder: string) {
    const file = files.find((item) => item.path === sourcePath);
    if (!file) return;
    const name = sourcePath.split("/").pop() || sourcePath;
    const nextPath = targetFolder ? `${targetFolder}/${name}` : name;
    if (nextPath === sourcePath) return;
    if (
      files.some(
        (item) => item.path.toLowerCase() === nextPath.toLowerCase(),
      ) ||
      folderPathsFor(files, folders).some(
        (folder) => folder.toLowerCase() === nextPath.toLowerCase(),
      )
    ) {
      setError("That folder already contains an item with the same name.");
      return;
    }
    setError("");
    try {
      await runtime.mutateFile("rename", sourcePath, nextPath);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Couldn't move this file.",
      );
      return;
    }
    if (targetFolder)
      setExpandedFolders(
        (current) =>
          new Set([...current, ...folderPathsFor([], [targetFolder])]),
      );
    if (activePath === sourcePath) setActivePath(nextPath);
  }

  function toggleFolder(path: string) {
    setExpandedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const explorerTree = buildExplorerTree(files, folders);

  function renderExplorerNodes(
    nodes: ExplorerNode[],
    depth = 0,
  ): React.ReactNode {
    return nodes.map((node) => {
      const isFolder = node.kind === "folder";
      const expanded = expandedFolders.has(node.path);
      return (
        <div className="explorer-node" key={`${node.kind}:${node.path}`}>
          <button
            type="button"
            className={`explorer-entry${activePath === node.path ? " active" : ""}${dropTarget === node.path ? " drop-target" : ""}${draggedFile === node.path ? " dragging" : ""}`}
            style={{ paddingLeft: `${8 + depth * 14}px` }}
            draggable={!isFolder}
            onClick={() =>
              isFolder ? toggleFolder(node.path) : openFile(node.path)
            }
            onContextMenu={(event) => {
              event.stopPropagation();
              showExplorerMenu(event, node.path, node.kind);
            }}
            onDragStart={(event) => {
              if (isFolder) return;
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", node.path);
              setDraggedFile(node.path);
            }}
            onDragEnd={() => {
              setDraggedFile("");
              setDropTarget(null);
            }}
            onDragOver={(event) => {
              if (!isFolder) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDropTarget(node.path);
            }}
            onDragLeave={() =>
              setDropTarget((current) =>
                current === node.path ? null : current,
              )
            }
            onDrop={(event) => {
              if (!isFolder) return;
              event.preventDefault();
              event.stopPropagation();
              const sourcePath = event.dataTransfer.getData("text/plain");
              if (sourcePath) moveFileToFolder(sourcePath, node.path);
              setDraggedFile("");
              setDropTarget(null);
            }}
            aria-expanded={isFolder ? expanded : undefined}
            title={node.path}
          >
            {isFolder ? (
              <>
                {expanded ? (
                  <ChevronDown size={13} />
                ) : (
                  <ChevronRight size={13} />
                )}
                {expanded ? <FolderOpen size={14} /> : <Folder size={14} />}
              </>
            ) : (
              <FileCode2 size={14} />
            )}
            <span>{node.name}</span>
          </button>
          {isFolder &&
            expanded &&
            renderExplorerNodes(node.children, depth + 1)}
        </div>
      );
    });
  }

  async function renameFile() {
    if (!activeFile) return;
    const nextPath = window.prompt("Rename file", activeFile.path)?.trim();
    if (!nextPath || files.some((file) => file.path === nextPath)) return;
    try {
      await runtime.mutateFile("rename", activeFile.path, nextPath);
      setActivePath(nextPath);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Couldn't rename this file.",
      );
    }
  }

  async function deleteFile() {
    if (!activeFile || !window.confirm(`Delete ${activeFile.path}?`)) return;
    try {
      await runtime.mutateFile("delete", activeFile.path);
      setActivePath("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Couldn't delete this file.",
      );
    }
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || sending) return;
    const text = prompt.trim();
    if (
      pendingMessage.current?.text !== text ||
      pendingMessage.current?.chat !== activeChatId
    )
      pendingMessage.current = {
        id: crypto.randomUUID(),
        text,
        chat: activeChatId,
      };
    setSending(true);
    setError("");
    try {
      await runtime.flush();
      const response = await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          chatId: activeChatId || undefined,
          requestId: pendingMessage.current.id,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setMessages((current) => [
        ...current.filter((message) => message.id !== result.message.id),
        result.message,
      ]);
      pendingMessage.current = null;
      if (result.conversationId && result.conversationId !== activeChatId) {
        const newChat = { id: result.conversationId, title: text };
        setActiveChatId(result.conversationId);
        setChats((current) => [
          newChat,
          ...current.filter((chat) => chat.id !== newChat.id),
        ]);
        router.replace(`/project/${projectId}?chat=${result.conversationId}`);
      } else if (activeChatId) {
        setChats((current) =>
          current.map((chat) =>
            chat.id === activeChatId && chat.title === "New chat"
              ? { ...chat, title: text }
              : chat,
          ),
        );
      }
      setPrompt("");
      runtime.queued(result.jobId);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Couldn't save the message.",
      );
    } finally {
      setSending(false);
    }
  }

  async function createChat() {
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/chats`, {
        method: "POST",
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setChats((current) => [result.chat, ...current]);
      setActiveChatId(result.chat.id);
      setMessages([]);
      setPrompt("");
      router.push(`/project/${projectId}?chat=${result.chat.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Couldn't create a chat.",
      );
    }
  }

  async function selectChat(chat: ChatSummary) {
    if (chat.id === activeChatId) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}?chat=${chat.id}`,
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setActiveChatId(result.conversationId);
      setMessages(result.messages || []);
      router.push(`/project/${projectId}?chat=${chat.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Couldn't open this chat.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function runApplication() {
    try {
      await runtime.flush();
      await runtime.request(runtime.appRunning ? "app.stop" : "app.start", {
        command: runCommand,
      });
      setBottomPanel("logs");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't run the application.",
      );
    }
  }
  function restartWorkspaceForPreview() {
    previewAppStart.current = false;
    workspaceToolStart.current = null;
    setPreviewNeedsRestart(false);
    setError("Restarting the workspace to enable Preview…");
    void runtime.control("stop").catch((reason) => {
      setPreviewNeedsRestart(true);
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't restart the workspace for Preview.",
      );
    });
  }
  async function importLegacyFiles() {
    try {
      for (const file of legacyFiles) {
        const existing = files.find((item) => item.path === file.path);
        if (existing?.content === file.content) continue;
        if (existing)
          throw new Error(
            `Import stopped: ${file.path} already exists with different content. The browser backup is unchanged.`,
          );
        await runtime.request("write", {
          path: file.path,
          content: file.content,
          hash: "",
          create: true,
        });
      }
      setLegacyFiles([]); // Retain the original browser cache as a recoverable backup.
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't import browser files.",
      );
    }
  }

  if (loading)
    return (
      <div className="builder-loading reference-loading">
        Opening project workspace…
      </div>
    );
  if (!project)
    return (
      <div className="builder-loading reference-loading">
        <p>{error || "Project not found."}</p>
        <Link href="/dashboard/projects">Back to projects</Link>
      </div>
    );

  return (
    <div
      className="runly-workspace codex-workspace reference-workspace"
      onMouseDown={(event) => {
        if (!(event.target as HTMLElement).closest(".editor-menu-anchor")) {
          setProjectMenuOpen(false);
          setBranchMenuOpen(false);
          setAppMenuOpen(null);
        }
      }}
    >
      <header className="editor-appbar">
        <Link href="/dashboard/projects" className="editor-appbar-brand">
          <Image
            src="/brand/runly-lockup.png"
            width={72}
            height={24}
            alt="Runly"
            priority
          />
        </Link>
        <nav
          className="editor-appbar-menu"
          aria-label="Editor application menu"
        >
          <div className="editor-menu-anchor">
            <button
              type="button"
              aria-expanded={appMenuOpen === "view"}
              onClick={() =>
                setAppMenuOpen(appMenuOpen === "view" ? null : "view")
              }
            >
              View
            </button>
            {appMenuOpen === "view" && (
              <div className="editor-dropdown app-menu-dropdown">
                <p>Workspace view</p>
                <button
                  type="button"
                  className={workspaceView === "chat" ? "selected-branch" : ""}
                  onClick={() => {
                    setWorkspaceView("chat");
                    setAppMenuOpen(null);
                  }}
                >
                  Chat
                </button>
                <button
                  type="button"
                  className={workspaceView === "code" ? "selected-branch" : ""}
                  onClick={() => {
                    setWorkspaceView("code");
                    setAppMenuOpen(null);
                  }}
                >
                  Files
                </button>
                <button
                  type="button"
                  className={
                    workspaceView === "preview" ? "selected-branch" : ""
                  }
                  onClick={() => {
                    setWorkspaceView("preview");
                    setAppMenuOpen(null);
                  }}
                >
                  Preview
                </button>
              </div>
            )}
          </div>
          <div className="editor-menu-anchor">
            <button
              type="button"
              aria-expanded={appMenuOpen === "help"}
              onClick={() =>
                setAppMenuOpen(appMenuOpen === "help" ? null : "help")
              }
            >
              Help
            </button>
            {appMenuOpen === "help" && (
              <div className="editor-dropdown app-menu-dropdown help-dropdown">
                <p>Runly workspace</p>
                <div className="editor-help-row">
                  <span>Toggle files</span>
                  <kbd>⌘ K</kbd>
                </div>
                <div className="editor-help-row">
                  <span>Toggle preview</span>
                  <kbd>⌘ P</kbd>
                </div>
                <div className="editor-dropdown-divider" />
                <button type="button" onClick={() => setAppMenuOpen(null)}>
                  Workspace help
                </button>
                <button type="button" onClick={() => setAppMenuOpen(null)}>
                  About Runly
                </button>
              </div>
            )}
          </div>
        </nav>
        <div className="editor-project-controls">
          <div className="editor-menu-anchor">
            <button
              type="button"
              className="editor-project-selector"
              aria-expanded={projectMenuOpen}
              onClick={() => {
                setProjectMenuOpen((open) => !open);
                setBranchMenuOpen(false);
              }}
            >
              <FolderOpen size={15} aria-hidden="true" />
              <span>{project.name}</span>
              <ChevronDown size={14} />
            </button>
            {projectMenuOpen && (
              <div className="editor-dropdown project-dropdown">
                <button
                  type="button"
                  onClick={() => window.location.assign("/dashboard/projects")}
                >
                  <PlusCircle size={15} /> New Project…
                </button>
                <button type="button" onClick={() => setProjectMenuOpen(false)}>
                  <FolderOpen size={15} /> Open…
                </button>
                <button type="button" onClick={() => setProjectMenuOpen(false)}>
                  <GitBranch size={15} /> Clone Repository…
                </button>
                <div className="editor-dropdown-divider" />
                <p>Open Projects</p>
                {projects.map((item) => (
                  <Link
                    href={`/project/${item.id}`}
                    key={item.id}
                    onClick={() => setProjectMenuOpen(false)}
                  >
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
          <div className="editor-menu-anchor">
            <button
              type="button"
              className="editor-branch-selector"
              aria-expanded={branchMenuOpen}
              onClick={() => {
                setBranchMenuOpen((open) => !open);
                setProjectMenuOpen(false);
              }}
            >
              <GitBranch size={15} /> master <ChevronDown size={13} />
            </button>
            {branchMenuOpen && (
              <div className="editor-dropdown branch-dropdown">
                <p>Git branches</p>
                <button type="button" className="selected-branch">
                  <GitBranch size={15} /> master
                </button>
                <button type="button" onClick={() => setBranchMenuOpen(false)}>
                  <PlusCircle size={15} /> New branch…
                </button>
                <button type="button" onClick={() => setBranchMenuOpen(false)}>
                  Manage branches…
                </button>
              </div>
            )}
          </div>
        </div>
        <span className="editor-appbar-spacer" />
        <nav className="editor-appbar-tools" aria-label="Editor tools">
          <span className="workspace-runtime-tooltip-wrap">
            <span
              className={`workspace-runtime-state workspace-runtime-${runtimeStatus.toLowerCase()}`}
              role="status"
              tabIndex={0}
              aria-describedby="workspace-status-tooltip"
            >
              <span className="workspace-runtime-dot" aria-hidden="true" />
              {runtimeStatus}
            </span>
            <span
              className="workspace-runtime-tooltip"
              id="workspace-status-tooltip"
              role="tooltip"
            >
              {runtimeStatus === "Running"
                ? "An app, agent, or save is active in this workspace."
                : runtimeStatus === "Starting"
                  ? "The server is starting or connecting to your workspace."
                  : runtimeStatus === "Idle"
                    ? "Your workspace is ready. It stops automatically after five minutes without activity."
                    : "The workspace is stopped or disconnected. Opening Files, Terminal, or Preview starts it when needed."}
              {runtime.mode === "mock" && " Local mock environment."}
            </span>
          </span>
          {runtime.agentBusy && (
            <button
              type="button"
              onClick={() =>
                void runtime
                  .request("agent.cancel")
                  .catch((reason) => setError(reason.message))
              }
            >
              Stop agent
            </button>
          )}
          <button
            type="button"
            className={workspaceView === "code" ? "active" : ""}
            aria-pressed={workspaceView === "code"}
            onClick={() =>
              setWorkspaceView(workspaceView === "code" ? "chat" : "code")
            }
          >
            Files
          </button>
          <button
            type="button"
            className={workspaceView === "preview" ? "active" : ""}
            aria-pressed={workspaceView === "preview"}
            onClick={() => {
              if (workspaceView !== "preview") {
                setError("");
                setPreviewNeedsRestart(false);
              }
              setWorkspaceView(
                workspaceView === "preview" ? "chat" : "preview",
              );
            }}
          >
            Preview
          </button>
          <button
            type="button"
            className="editor-theme-toggle"
            onClick={toggleTheme}
            aria-label={darkTheme ? "Use light theme" : "Use dark theme"}
            aria-pressed={darkTheme}
            title={darkTheme ? "Use light theme" : "Use dark theme"}
          >
            {darkTheme ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </nav>
      </header>
      <aside className="reference-sidebar">
        <section
          className={`reference-chats${workspaceView === "code" ? " reference-explorer" : ""}`}
          aria-label={
            workspaceView === "code" ? "Project explorer" : "Project chats"
          }
        >
          <div className="reference-sidebar-heading">
            <p>{workspaceView === "code" ? "Explorer" : "Chats"}</p>
            <button
              type="button"
              onClick={() =>
                workspaceView === "code" ? addFile() : createChat()
              }
              aria-label={workspaceView === "code" ? "New file" : "New chat"}
              title={workspaceView === "code" ? "New file" : "New chat"}
            >
              {workspaceView === "code" ? (
                <FilePlus2 size={16} />
              ) : (
                <Plus size={16} />
              )}
            </button>
          </div>
          {(error || runtime.error) && (
            <p className="reference-sidebar-error" role="alert">
              {error || runtime.error}
            </p>
          )}
          <nav
            className={`reference-chat-list${workspaceView === "code" && dropTarget === "" ? " explorer-root-drop-active" : ""}`}
            aria-label={
              workspaceView === "code" ? "Files and folders" : "Chats"
            }
            onContextMenu={
              workspaceView === "code"
                ? (event) => showExplorerMenu(event)
                : undefined
            }
            onDragOver={
              workspaceView === "code"
                ? (event) => {
                    event.preventDefault();
                    if (
                      !(event.target as HTMLElement).closest(".explorer-entry")
                    )
                      setDropTarget("");
                  }
                : undefined
            }
            onDragLeave={
              workspaceView === "code"
                ? (event) => {
                    if (event.target === event.currentTarget)
                      setDropTarget(null);
                  }
                : undefined
            }
            onDrop={
              workspaceView === "code"
                ? (event) => {
                    if (
                      (event.target as HTMLElement).closest(".explorer-entry")
                    )
                      return;
                    event.preventDefault();
                    const sourcePath = event.dataTransfer.getData("text/plain");
                    if (sourcePath) moveFileToFolder(sourcePath, "");
                    setDropTarget(null);
                    setDraggedFile("");
                  }
                : undefined
            }
          >
            {workspaceView === "code" ? (
              <>
                {explorerTree.length ? (
                  renderExplorerNodes(explorerTree)
                ) : (
                  <div
                    className={`explorer-root-drop${dropTarget === "" ? " drop-target" : ""}`}
                  >
                    <FileCode2 size={15} />
                    <span>Right-click or use + to add files</span>
                  </div>
                )}
                {!!explorerTree.length && !!draggedFile && (
                  <div
                    className={`explorer-root-hint${dropTarget === "" ? " drop-target" : ""}`}
                  >
                    Drop to move to project root
                  </div>
                )}
              </>
            ) : (
              <>
                {chats.map((chat) => (
                  <button
                    type="button"
                    className={`reference-chat-item${chat.id === activeChatId ? " active" : ""}`}
                    onClick={() => void selectChat(chat)}
                    onContextMenu={(event) => {
                      event.stopPropagation();
                      showChatMenu(event, chat);
                    }}
                    key={chat.id}
                    title={chat.title}
                  >
                    <MessageSquare size={14} />
                    <span>{chat.title}</span>
                  </button>
                ))}
                {!chats.length && (
                  <span className="reference-chat-empty">No chats yet</span>
                )}
              </>
            )}
          </nav>
        </section>
        <nav className="reference-sidebar-apps" aria-label="Runly tools">
          <Link href="/plugins">
            <Plug size={15} /> Plugins
          </Link>
          <Link href="/skills">
            <Sparkles size={15} /> Skills
          </Link>
          <Link href="/workshop">
            <Blocks size={15} /> Workshop
          </Link>
          <button type="button" onClick={() => setSettingsOpen(true)}>
            <Settings size={15} /> Settings
          </button>
        </nav>
        <footer className="reference-account">
          <span>D</span>
          <p>Runly account</p>
        </footer>
      </aside>

      <main className="reference-main">
        {workspaceView === "chat" && (
          <section className="reference-chat-stage">
            <div className="reference-thread">
              {messages.length ? (
                messages.map((message) => (
                  <article
                    className={`reference-message message-${message.role}`}
                    key={message.id}
                  >
                    {message.role !== "user" && (
                      <Image
                        className="reference-message-mark"
                        src="/brand/runly-mark.png"
                        width={15}
                        height={15}
                        alt=""
                      />
                    )}
                    <p>{message.body}</p>
                  </article>
                ))
              ) : (
                <div className="reference-empty">
                  <Bot size={30} />
                  <h1>
                    {dayPart
                      ? `Good ${dayPart}, ${userName}`
                      : "What should we build?"}
                  </h1>
                  <p>
                    {dayPart
                      ? "What shall we build today?"
                      : "Describe your idea and Runly will plan the project with you."}
                  </p>
                </div>
              )}
            </div>
            <form className="reference-composer" onSubmit={sendMessage}>
              <textarea
                ref={composerInput}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="What would you like to know?"
                aria-label="Message Runly"
              />
              <div>
                <span>
                  <button type="button" aria-label="Attach image">
                    <ImageIcon size={17} />
                  </button>
                  <button type="button" aria-label="Usage" title="Usage">
                    <Gauge size={18} />
                  </button>
                  <button type="button" aria-label="Voice input">
                    <Mic size={17} />
                  </button>
                </span>
                <button
                  className="reference-send"
                  disabled={!prompt.trim() || sending}
                  aria-label="Send message"
                >
                  <ArrowUp size={17} />
                </button>
              </div>
            </form>
          </section>
        )}

        {workspaceView === "code" && (
          <section
            className="reference-tool-stage"
            style={{
              gridTemplateRows: `48px minmax(0, 1fr) ${bottomPanelHeight}px`,
            }}
          >
            <header className="reference-tool-head">
              <button onClick={() => setWorkspaceView("chat")}>
                <ArrowLeft size={15} /> Chat
              </button>
              <strong>{activeFile?.path || "Code editor"}</strong>
              <span>
                {!!legacyFiles.length && (
                  <button
                    disabled={runtime.state !== "ready"}
                    onClick={() => void importLegacyFiles()}
                  >
                    Import browser files
                  </button>
                )}
                <button onClick={() => addFile()} aria-label="New file">
                  <FilePlus2 size={15} />
                </button>
                <button onClick={renameFile} aria-label="Rename file">
                  <Pencil size={14} />
                </button>
                <button onClick={deleteFile} aria-label="Delete file">
                  <Trash2 size={14} />
                </button>
                <button onClick={() => setWorkspaceView("preview")}>
                  <Play size={14} /> Preview
                </button>
              </span>
            </header>
            <div className="reference-code-layout">
              {activeFile ? (
                <div className="reference-code-card full">
                  <div className="line-numbers">
                    {activeFile.content.split("\n").map((_, index) => (
                      <span key={index}>{index + 1}</span>
                    ))}
                  </div>
                  <textarea
                    spellCheck={false}
                    aria-label={`Editing ${activeFile.path}`}
                    value={activeFile.content}
                    readOnly={runtime.state !== "ready" || runtime.agentBusy}
                    onChange={(event) =>
                      runtime.edit(activeFile, event.target.value)
                    }
                  />
                </div>
              ) : (
                <div className="reference-tool-empty">
                  <Code2 size={25} />
                  <h2>No code yet</h2>
                  <p>Ask Runly to build something or create a file manually.</p>
                  <button onClick={() => addFile()}>Create a file</button>
                </div>
              )}
            </div>
            <div className="workspace-bottom">
              <div
                className="workspace-panel-resize"
                role="separator"
                aria-label="Resize Terminal and Console panel"
                aria-orientation="horizontal"
                aria-valuemin={120}
                aria-valuenow={bottomPanelHeight}
                tabIndex={0}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  panelResize.current = {
                    pointerId: event.pointerId,
                    startY: event.clientY,
                    startHeight: bottomPanelHeight,
                  };
                }}
                onPointerMove={(event) => {
                  const drag = panelResize.current;
                  if (drag?.pointerId === event.pointerId)
                    resizeBottomPanel(
                      drag.startHeight + drag.startY - event.clientY,
                    );
                }}
                onPointerUp={(event) => {
                  if (panelResize.current?.pointerId === event.pointerId)
                    panelResize.current = null;
                }}
                onPointerCancel={() => {
                  panelResize.current = null;
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                    event.preventDefault();
                    resizeBottomPanel(
                      bottomPanelHeight + (event.key === "ArrowUp" ? 16 : -16),
                    );
                  }
                }}
              >
                <span />
              </div>
              <div className="workspace-bottom-tabs">
                <button
                  className={bottomPanel === "terminal" ? "active" : ""}
                  onClick={() => setBottomPanel("terminal")}
                >
                  <SquareTerminal size={14} /> Terminal
                </button>
                <button
                  className={bottomPanel === "logs" ? "active" : ""}
                  onClick={() => setBottomPanel("logs")}
                >
                  <PanelBottom size={14} /> Console / logs
                </button>
              </div>
              {bottomPanel === "terminal" ? (
                <WorkspaceTerminal
                  ready={runtime.state === "ready"}
                  dark={darkTheme}
                  request={runtime.request}
                  subscribe={runtime.subscribe}
                />
              ) : (
                <div className="workspace-logs">
                  <form
                    className="workspace-run-controls"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void runApplication();
                    }}
                  >
                    <input
                      aria-label="Application run command"
                      value={runCommand}
                      onChange={(event) => setRunCommand(event.target.value)}
                      disabled={runtime.appRunning}
                    />
                    <button type="submit" disabled={runtime.state !== "ready"}>
                      {runtime.appRunning ? "Stop app" : "Run app"}
                    </button>
                  </form>
                  <pre aria-label="Application logs">
                    {runtime.consoleLog ||
                      "Run your application to see its output here."}
                  </pre>
                </div>
              )}
            </div>
          </section>
        )}
        {workspaceView === "preview" && (
          <section className="reference-tool-stage">
            <header className="reference-tool-head">
              <button onClick={() => setWorkspaceView("chat")}>
                <ArrowLeft size={15} /> Chat
              </button>
              <strong>Preview</strong>
              <button onClick={() => setWorkspaceView("code")}>
                <Code2 size={14} /> Code
              </button>
              {runtime.previewUrl && (
                <button
                  aria-label="Refresh preview"
                  title="Refresh preview"
                  onClick={() => setPreviewReload((value) => value + 1)}
                >
                  <RotateCw size={14} />
                </button>
              )}
            </header>
            {runtime.previewUrl ? (
              <iframe
                key={`${runtime.previewUrl}:${previewReload}`}
                className="workspace-preview-frame"
                src={runtime.previewUrl}
                title="Local application preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-downloads"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="workspace-preview-empty">
                <Eye size={28} />
                <h2>
                  {error
                    ? "Preview needs attention"
                    : runtime.state === "stopped" ||
                        ["connecting", "starting"].includes(runtime.state)
                      ? "Starting workspace…"
                      : runtime.appRunning
                        ? "Starting your app…"
                        : "Preparing preview…"}
                </h2>
                <p>
                  {error ||
                    (runtimeState === "ready" &&
                    !appRunning &&
                    !devCommandFor(files)
                      ? "Add a package.json with a dev script to run an app in Preview."
                      : "Preview starts the first package.json dev script it finds in this project.")}
                </p>
                {runtime.state === "ready" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (previewNeedsRestart) restartWorkspaceForPreview();
                      else {
                        previewAppStart.current = false;
                        setError("");
                        setPreviewReload((value) => value + 1);
                      }
                    }}
                  >
                    <RotateCw size={14} />
                    {previewNeedsRestart
                      ? "Restart workspace for Preview"
                      : "Retry preview"}
                  </button>
                )}
              </div>
            )}
          </section>
        )}
        {workspaceView === "terminal" && (
          <section className="reference-tool-stage">
            <header className="reference-tool-head">
              <button onClick={() => setWorkspaceView("chat")}>
                <ArrowLeft size={15} /> Chat
              </button>
              <strong>Terminal</strong>
            </header>
            <WorkspaceTerminal
              ready={runtime.state === "ready"}
              dark={darkTheme}
              request={runtime.request}
              subscribe={runtime.subscribe}
            />
          </section>
        )}
      </main>
      {explorerMenu && (
        <div
          className="workspace-context-backdrop"
          onMouseDown={() => setExplorerMenu(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            className="workspace-context-menu"
            role="menu"
            style={{ left: explorerMenu.x, top: explorerMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p>{explorerMenu.parentPath || project?.name || "Project root"}</p>
            <button
              type="button"
              role="menuitem"
              onClick={() => openNewItem("file", explorerMenu.parentPath)}
            >
              <FilePlus2 size={15} /> New file
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => addFolder(explorerMenu.parentPath)}
            >
              <Folder size={15} /> New folder
            </button>
          </div>
        </div>
      )}
      {chatMenu && (
        <div
          className="workspace-context-backdrop"
          onMouseDown={() => setChatMenu(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            className="workspace-context-menu"
            role="menu"
            style={{ left: chatMenu.x, top: chatMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <p>{chatMenu.chat.title}</p>
            <button
              type="button"
              role="menuitem"
              onClick={() => startRenamingChat(chatMenu.chat)}
            >
              <Pencil size={14} /> Rename
            </button>
            <button
              type="button"
              role="menuitem"
              className="workspace-context-danger"
              onClick={() => {
                setDeletingChat(chatMenu.chat);
                setChatMenu(null);
              }}
            >
              <Trash2 size={14} /> Delete chat
            </button>
          </div>
        </div>
      )}
      {deletingChat && (
        <div
          className="workspace-dialog-backdrop"
          onMouseDown={() => !deletingChatBusy && setDeletingChat(null)}
        >
          <section
            className="workspace-file-dialog workspace-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
            aria-describedby="delete-chat-description"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !deletingChatBusy)
                setDeletingChat(null);
            }}
          >
            <div className="workspace-confirm-content">
              <div className="workspace-dialog-heading">
                <div>
                  <h2 id="delete-chat-title">Delete chat?</h2>
                  <p id="delete-chat-description">
                    Delete “{deletingChat.title}”? This will also delete its
                    messages.
                  </p>
                </div>
              </div>
              <div className="workspace-dialog-actions">
                <button
                  type="button"
                  disabled={deletingChatBusy}
                  onClick={() => setDeletingChat(null)}
                >
                  Keep chat
                </button>
                <button
                  type="button"
                  className="primary danger"
                  disabled={deletingChatBusy}
                  onClick={() => void deleteChat(deletingChat)}
                >
                  {deletingChatBusy ? "Deleting…" : "Delete chat"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
      {renamingChat && (
        <div
          className="workspace-dialog-backdrop"
          onMouseDown={() => setRenamingChat(null)}
        >
          <section
            className="workspace-file-dialog workspace-rename-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-chat-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setRenamingChat(null);
            }}
          >
            <form onSubmit={saveChatRename}>
              <div className="workspace-dialog-heading">
                <div>
                  <h2 id="rename-chat-title">Rename chat</h2>
                  <p>Choose a clear name for this conversation.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setRenamingChat(null)}
                  aria-label="Close rename chat dialog"
                >
                  <X size={16} />
                </button>
              </div>
              <label htmlFor="rename-chat-input">Chat name</label>
              <input
                ref={renameChatInput}
                id="rename-chat-input"
                value={renameChatTitle}
                maxLength={80}
                onChange={(event) => {
                  setRenameChatTitle(event.target.value);
                  setRenameChatError("");
                }}
                aria-invalid={!!renameChatError}
                aria-describedby={
                  renameChatError ? "rename-chat-error" : undefined
                }
                autoComplete="off"
              />
              {renameChatError && (
                <p
                  className="workspace-dialog-error"
                  id="rename-chat-error"
                  role="alert"
                >
                  {renameChatError}
                </p>
              )}
              <div className="workspace-dialog-actions">
                <button type="button" onClick={() => setRenamingChat(null)}>
                  Cancel
                </button>
                <button
                  className="primary"
                  type="submit"
                  disabled={renamingChatBusy || !renameChatTitle.trim()}
                >
                  {renamingChatBusy ? "Saving…" : "Save name"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {newFileOpen && (
        <div
          className="workspace-dialog-backdrop"
          onMouseDown={() => setNewFileOpen(false)}
        >
          <section
            className="workspace-file-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-file-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setNewFileOpen(false);
            }}
          >
            <form onSubmit={createFile}>
              <div className="workspace-dialog-heading">
                <div>
                  <h2 id="new-file-title">Create a {newItemKind}</h2>
                  <p>Add it to the project explorer using a relative path.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewFileOpen(false)}
                  aria-label="Close new file dialog"
                >
                  <X size={16} />
                </button>
              </div>
              <label htmlFor="new-project-file">
                {newItemKind === "file" ? "File path" : "Folder path"}
              </label>
              <input
                ref={newFileInput}
                id="new-project-file"
                value={newFilePath}
                onChange={(event) => {
                  setNewFilePath(event.target.value);
                  setNewFileError("");
                }}
                placeholder={
                  newItemKind === "file" ? "README.md" : "src/components"
                }
                autoComplete="off"
                aria-invalid={!!newFileError}
                aria-describedby={
                  newFileError ? "new-file-error" : "new-file-help"
                }
              />
              {newFileError ? (
                <p
                  className="workspace-dialog-error"
                  id="new-file-error"
                  role="alert"
                >
                  {newFileError}
                </p>
              ) : (
                <p className="workspace-dialog-help" id="new-file-help">
                  Use forward slashes to create nested paths, for example{" "}
                  <code>src/components/App.tsx</code>.
                </p>
              )}
              <div className="workspace-dialog-actions">
                <button type="button" onClick={() => setNewFileOpen(false)}>
                  Cancel
                </button>
                <button className="primary" type="submit">
                  Create {newItemKind}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {settingsOpen && (
        <div
          className="workspace-dialog-backdrop"
          onMouseDown={() => setSettingsOpen(false)}
        >
          <section
            className="workspace-file-dialog editor-settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-settings-title"
            onMouseDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Escape") setSettingsOpen(false);
            }}
          >
            <header className="editor-settings-header">
              <div>
                <Settings size={16} />
                <h2 id="editor-settings-title">Settings</h2>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                <X size={16} />
              </button>
            </header>
            <div className="editor-settings-layout">
              <aside
                className="editor-settings-nav"
                aria-label="Settings categories"
              >
                <p>PERSONALIZATION</p>
                <button type="button" className="active">
                  <Sun size={15} /> Appearances
                </button>
              </aside>
              <section
                className="editor-settings-content"
                aria-labelledby="appearance-title"
              >
                <h3 id="appearance-title">Appearances</h3>
                <div className="editor-settings-row">
                  <div>
                    <strong>Color theme</strong>
                    <span>Choose how the editor looks.</span>
                  </div>
                  <div
                    className="editor-settings-options"
                    aria-label="Color theme"
                  >
                    <button
                      type="button"
                      className={!darkTheme ? "active" : ""}
                      aria-pressed={!darkTheme}
                      onClick={() => darkTheme && toggleTheme()}
                    >
                      Light
                    </button>
                    <button
                      type="button"
                      className={darkTheme ? "active" : ""}
                      aria-pressed={darkTheme}
                      onClick={() => !darkTheme && toggleTheme()}
                    >
                      Dark
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
