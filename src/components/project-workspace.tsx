"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUp,
  Bot,
  ChevronRight,
  Code2,
  Eye,
  FileCode2,
  FilePlus2,
  Image as ImageIcon,
  Menu,
  Mic,
  Moon,
  PanelBottom,
  Pencil,
  Play,
  PlusCircle,
  RotateCw,
  Search,
  SquareTerminal,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "./theme-provider";

type Project = { id: string; name: string; status: string };
type ProjectSummary = Project & { updated_at?: string };
type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  body: string;
  created_at: string;
};
type ProjectFile = { path: string; language: string; content: string };

const starterFiles: ProjectFile[] = [];

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const { darkTheme, toggleTheme } = useTheme();
  const [project, setProject] = useState<Project | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectSearch, setProjectSearch] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>(starterFiles);
  const [activePath, setActivePath] = useState("");
  const [workspaceView, setWorkspaceView] = useState<
    "chat" | "code" | "preview" | "terminal"
  >("chat");
  const [bottomPanel, setBottomPanel] = useState<"terminal" | "logs">(
    "terminal",
  );
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [terminalInput, setTerminalInput] = useState("");
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("README.md");
  const [newFileError, setNewFileError] = useState("");
  const [terminalLines, setTerminalLines] = useState([
    "Runly workspace ready.",
    "Type `help` to see local commands.",
  ]);
  const hydratedFiles = useRef(false);
  const newFileInput = useRef<HTMLInputElement>(null);
  const composerInput = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects", { signal: controller.signal })
      .then((response) => response.json())
      .then((result) =>
        setProjects(Array.isArray(result.projects) ? result.projects : []),
      )
      .catch(() => undefined);
    fetch(`/api/projects/${projectId}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        return result;
      })
      .then((result) => {
        setProject(result.project);
        setMessages(result.messages);
        const stored = localStorage.getItem(`runly:files:v2:${projectId}`);
        if (stored) {
          const parsed = JSON.parse(stored) as ProjectFile[];
          if (Array.isArray(parsed) && parsed.length) {
            setFiles(parsed);
            setActivePath(parsed[0].path);
          }
        }
        hydratedFiles.current = true;
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
    if (hydratedFiles.current)
      localStorage.setItem(
        `runly:files:v2:${projectId}`,
        JSON.stringify(files),
      );
  }, [files, projectId]);

  useEffect(() => {
    if (newFileOpen) newFileInput.current?.focus();
  }, [newFileOpen]);

  const activeFile = files.find((file) => file.path === activePath);
  const visibleProjects = projects.filter((item) =>
    item.name.toLowerCase().includes(projectSearch.trim().toLowerCase()),
  );

  function openFile(path: string) {
    setActivePath(path);
    setWorkspaceView("code");
  }

  function addFile() {
    setNewFilePath("README.md");
    setNewFileError("");
    setNewFileOpen(true);
  }

  function createFile(event: React.FormEvent) {
    event.preventDefault();
    const path = newFilePath.trim().replace(/^\/+/, "");
    if (!path) {
      setNewFileError("Enter a file path.");
      return;
    }
    if (files.some((file) => file.path.toLowerCase() === path.toLowerCase())) {
      setNewFileError("A file with this path already exists.");
      return;
    }
    const language = path.split(".").pop() || "text";
    setFiles((current) => [...current, { path, language, content: "" }]);
    openFile(path);
    setNewFileOpen(false);
  }

  function renameFile() {
    if (!activeFile) return;
    const nextPath = window.prompt("Rename file", activeFile.path)?.trim();
    if (!nextPath || files.some((file) => file.path === nextPath)) return;
    setFiles((current) =>
      current.map((file) =>
        file.path === activeFile.path ? { ...file, path: nextPath } : file,
      ),
    );
    setActivePath(nextPath);
  }

  function deleteFile() {
    if (!activeFile || !window.confirm(`Delete ${activeFile.path}?`)) return;
    const remaining = files.filter((file) => file.path !== activeFile.path);
    setFiles(remaining);
    setActivePath(remaining[0]?.path || "");
  }

  async function sendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || sending) return;
    const text = prompt.trim();
    setSending(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: AbortSignal.timeout(20_000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setMessages((current) => [...current, result.message]);
      setPrompt("");
      setTerminalLines((lines) => [
        ...lines,
        `[chat] Saved instruction: ${text}`,
      ]);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Couldn't save the message.",
      );
    } finally {
      setSending(false);
    }
  }

  function runTerminal(event: React.FormEvent) {
    event.preventDefault();
    const command = terminalInput.trim();
    if (!command) return;
    if (command === "clear") setTerminalLines([]);
    else if (command === "help")
      setTerminalLines((lines) => [
        ...lines,
        `$ ${command}`,
        "Commands: help, clear, ls",
      ]);
    else if (command === "ls")
      setTerminalLines((lines) => [
        ...lines,
        `$ ${command}`,
        ...files.map((file) => file.path),
      ]);
    else
      setTerminalLines((lines) => [
        ...lines,
        `$ ${command}`,
        `Command not available in the browser workspace: ${command}`,
      ]);
    setTerminalInput("");
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
    <div className="runly-workspace codex-workspace reference-workspace">
      <aside className="reference-sidebar">
        <header className="reference-sidebar-head">
          <Link href="/dashboard/projects" aria-label="Back to projects">
            <Menu size={20} />
            <Image
              className="reference-brand-lockup"
              src="/brand/runly-lockup.png"
              width={54}
              height={18}
              alt="Runly"
              priority
            />
          </Link>
          <span className="reference-sidebar-actions">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={darkTheme ? "Use light theme" : "Use dark theme"}
              aria-pressed={darkTheme}
            >
              {darkTheme ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <Link href="/dashboard/projects" aria-label="Create a new project">
              <PlusCircle size={19} />
            </Link>
          </span>
        </header>
        <label className="reference-search">
          <input
            value={projectSearch}
            onChange={(event) => setProjectSearch(event.target.value)}
            placeholder="Search"
            aria-label="Search chats"
          />
          <Search size={15} />
        </label>
        <nav className="reference-chats" aria-label="Project chats">
          <p>Chats</p>
          {visibleProjects.map((item) => (
            <Link
              className={item.id === projectId ? "active" : ""}
              href={`/project/${item.id}`}
              key={item.id}
            >
              {item.name}
            </Link>
          ))}
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
                  <Bot size={23} />
                  <h1>What should we build?</h1>
                  <p>
                    Describe your idea and Runly will plan the project with you.
                  </p>
                </div>
              )}
              {activeFile && (
                <div className="reference-code-card">
                  <div className="line-numbers">
                    {activeFile.content.split("\n").map((_, index) => (
                      <span key={index}>{index + 1}</span>
                    ))}
                  </div>
                  <textarea
                    spellCheck={false}
                    aria-label={`Editing ${activeFile.path}`}
                    value={activeFile.content}
                    onChange={(event) =>
                      setFiles((current) =>
                        current.map((file) =>
                          file.path === activePath
                            ? { ...file, content: event.target.value }
                            : file,
                        ),
                      )
                    }
                  />
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
                  <button
                    type="button"
                    onClick={() => setWorkspaceView("code")}
                    aria-label="Open code editor"
                  >
                    <Code2 size={18} />
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
          <section className="reference-tool-stage">
            <header className="reference-tool-head">
              <button onClick={() => setWorkspaceView("chat")}>
                <ArrowLeft size={15} /> Chat
              </button>
              <strong>{activeFile?.path || "Code editor"}</strong>
              <span>
                <button onClick={addFile} aria-label="New file">
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
              <aside>
                <p>
                  <ChevronRight size={13} className="tree-open" /> project
                </p>
                {files.map((file) => (
                  <button
                    className={file.path === activePath ? "active" : ""}
                    key={file.path}
                    onClick={() => openFile(file.path)}
                  >
                    <FileCode2 size={13} />
                    {file.path}
                  </button>
                ))}
              </aside>
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
                    onChange={(event) =>
                      setFiles((current) =>
                        current.map((file) =>
                          file.path === activePath
                            ? { ...file, content: event.target.value }
                            : file,
                        ),
                      )
                    }
                  />
                </div>
              ) : (
                <div className="reference-tool-empty">
                  <Code2 size={25} />
                  <h2>No code yet</h2>
                  <p>Ask Runly to build something or create a file manually.</p>
                  <button onClick={addFile}>Create a file</button>
                </div>
              )}
            </div>
            <div className="workspace-bottom">
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
                <div className="terminal-body">
                  {terminalLines.map((line, index) => (
                    <pre key={`${line}-${index}`}>{line}</pre>
                  ))}
                  <form onSubmit={runTerminal}>
                    <span>$</span>
                    <input
                      value={terminalInput}
                      onChange={(event) => setTerminalInput(event.target.value)}
                      aria-label="Terminal command"
                      autoComplete="off"
                    />
                  </form>
                </div>
              ) : (
                <div className="workspace-logs">
                  <p>
                    <span className="log-ok" /> Project state loaded
                  </p>
                  <p>
                    <span className="log-ok" /> Browser editor ready
                  </p>
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
            </header>
            <div className="workspace-preview-empty">
              <Eye size={28} />
              <h2>Nothing to preview yet</h2>
              <p>
                Your project output will appear here after a successful build.
              </p>
              <button aria-label="Refresh preview">
                <RotateCw size={14} />
              </button>
            </div>
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
            <div className="terminal-body">
              {terminalLines.map((line, index) => (
                <pre key={`${line}-${index}`}>{line}</pre>
              ))}
              <form onSubmit={runTerminal}>
                <span>$</span>
                <input
                  value={terminalInput}
                  onChange={(event) => setTerminalInput(event.target.value)}
                  aria-label="Terminal command"
                  autoComplete="off"
                  autoFocus
                />
              </form>
            </div>
          </section>
        )}
      </main>
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
                  <h2 id="new-file-title">Create a file</h2>
                  <p>
                    Add a path now, or let Runly generate files from your
                    prompt.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewFileOpen(false)}
                  aria-label="Close new file dialog"
                >
                  <X size={16} />
                </button>
              </div>
              <label htmlFor="new-project-file">File path</label>
              <input
                ref={newFileInput}
                id="new-project-file"
                value={newFilePath}
                onChange={(event) => {
                  setNewFilePath(event.target.value);
                  setNewFileError("");
                }}
                placeholder="README.md"
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
                  Folders are created from the path, for example{" "}
                  <code>src/main.py</code>.
                </p>
              )}
              <div className="workspace-dialog-actions">
                <button type="button" onClick={() => setNewFileOpen(false)}>
                  Cancel
                </button>
                <button className="primary" type="submit">
                  Create file
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
