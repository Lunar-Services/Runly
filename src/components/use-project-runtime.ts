"use client";

import { useCallback, useEffect, useRef, useState } from "react";
export type WorkspaceFile = {
  path: string;
  kind?: "file";
  content: string;
  hash: string;
  language: string;
};
type FileEntry = {
  path: string;
  kind: "file" | "folder";
  content: string;
  hash: string;
};
export type RuntimeFrame = { type: string; [key: string]: unknown };

export function useProjectRuntime(
  projectId: string,
  onEvent: (frame: RuntimeFrame) => void,
) {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [state, setState] = useState("connecting");
  const [mode, setMode] = useState("openai");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [consoleLog, setConsoleLog] = useState("");
  const [appRunning, setAppRunning] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const callback = useRef(onEvent);
  const listeners = useRef(new Set<(frame: RuntimeFrame) => void>());
  const terminalHistory = useRef<RuntimeFrame[]>([]);
  const jobs = useRef(new Set<string>());
  const pending = useRef(
    new Map<
      string,
      {
        resolve: (data: Record<string, unknown>) => void;
        reject: (error: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    >(),
  );
  const drafts = useRef(
    new Map<string, { content: string; hash: string; version: number }>(),
  );
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const lastActivitySent = useRef(0);
  const flushing = useRef<Promise<void> | null>(null);
  useEffect(() => {
    callback.current = onEvent;
  }, [onEvent]);
  const applyFiles = useCallback(
    (entries: FileEntry[], removed: string[], full: boolean) => {
      setFiles((previous) => {
        const next = new Map(
          full ? [] : previous.map((file) => [file.path, file]),
        );
        for (const path of removed) next.delete(path);
        for (const file of entries)
          if (file.kind === "folder") next.delete(file.path);
        for (const file of entries)
          if (file.kind === "file") {
            const draft = drafts.current.get(file.path);
            next.set(file.path, {
              ...file,
              kind: "file",
              language: file.path.split(".").pop() || "text",
              content: draft?.content ?? file.content,
            });
          }
        return [...next.values()];
      });
      setFolders((previous) => {
        const next = new Set(full ? [] : previous);
        for (const path of removed) next.delete(path);
        for (const file of entries)
          if (file.kind === "folder") next.add(file.path);
          else next.delete(file.path);
        return [...next];
      });
    },
    [],
  );
  useEffect(() => {
    let disposed = false,
      retry: ReturnType<typeof setTimeout>,
      attempts = 0;
    const controller = new AbortController();
    async function connect() {
      try {
        const response = await fetch(`/api/projects/${projectId}/runtime`, {
          signal: controller.signal,
        });
        const data = await response.json();
        if ([401, 403, 404].includes(response.status)) {
          setError(data.message);
          setState("unavailable");
          return;
        }
        if (!response.ok) throw new Error(data.message);
        if (disposed) return;
        applyFiles(data.files, [], true);
        setMode(data.mode || "openai");
        setState(data.connection ? "connecting" : data.state);
        jobs.current = new Set(
          data.jobs
            .filter((job: { kind: string }) => job.kind === "agent")
            .map((job: { id: string }) => job.id),
        );
        setAgentBusy(jobs.current.size > 0);
        if (!data.connection) {
          setError("The project runtime has not been configured yet.");
          return;
        }
        const ws = new WebSocket(data.connection.url);
        socket.current = ws;
        ws.onopen = () => {
          terminalHistory.current = [];
          setConsoleLog("");
          for (const listener of listeners.current)
            listener({ type: "terminal.reset" });
          ws.send(
            JSON.stringify({
              type: "auth",
              role: "browser",
              ticket: data.connection.ticket,
            }),
          );
        };
        ws.onmessage = (event) => {
          const frame = JSON.parse(event.data) as RuntimeFrame;
          if (frame.type === "authenticated") {
            attempts = 0;
            setError("");
          }
          if (frame.type === "reply") {
            const request = pending.current.get(String(frame.id));
            if (request) {
              clearTimeout(request.timer);
              pending.current.delete(String(frame.id));
              if (frame.error) request.reject(new Error(String(frame.error)));
              else request.resolve(frame.result as Record<string, unknown>);
            }
          } else if (frame.type === "files.changed")
            applyFiles(
              frame.files as FileEntry[],
              frame.deleted as string[],
              !!frame.full,
            );
          else if (frame.type === "runtime.status") {
            const nextState = String(frame.state);
            setState(nextState);
            if (nextState === "stopped") {
              setAppRunning(false);
              setPreviewUrl(null);
            }
            if (frame.error) setError(String(frame.error));
          } else if (frame.type === "console.output")
            setConsoleLog((text) =>
              (text + String(frame.data)).slice(-128_000),
            );
          else if (frame.type === "app.status") {
            setAppRunning(!!frame.running);
            setPreviewUrl(
              typeof frame.previewUrl === "string" ? frame.previewUrl : null,
            );
          } else if (frame.type === "job.status") {
            if (frame.chatId) {
              if (frame.state === "running") jobs.current.add(String(frame.id));
              else jobs.current.delete(String(frame.id));
              setAgentBusy(jobs.current.size > 0);
            }
            if (frame.error) setError(String(frame.error));
          } else if (frame.type === "workspace.warning")
            setError(String(frame.message));
          if (frame.type === "terminal.output") {
            terminalHistory.current.push(frame);
            while (
              terminalHistory.current.reduce(
                (sum, item) => sum + String(item.data).length,
                0,
              ) > 256_000
            )
              terminalHistory.current.shift();
          }
          callback.current(frame);
          for (const listener of listeners.current) listener(frame);
        };
        ws.onclose = () => {
          for (const request of pending.current.values()) {
            clearTimeout(request.timer);
            request.reject(
              new Error(
                "Workspace disconnected. Reload files before retrying.",
              ),
            );
          }
          pending.current.clear();
          if (!disposed) {
            setState("disconnected");
            retry = setTimeout(
              connect,
              Math.min(30_000, 1000 * 2 ** attempts++) + Math.random() * 500,
            );
          }
        };
        ws.onerror = () => ws.close();
      } catch (reason) {
        if (!disposed) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Couldn't connect to the workspace.",
          );
          setState("disconnected");
          retry = setTimeout(connect, Math.min(30_000, 1000 * 2 ** attempts++));
        }
      }
    }
    void connect();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(retry);
      socket.current?.close();
    };
  }, [projectId, applyFiles]);
  const request = useCallback(
    (
      op: string,
      payload: Record<string, unknown> = {},
    ): Promise<Record<string, unknown>> => {
      if (socket.current?.readyState !== WebSocket.OPEN)
        return Promise.reject(new Error("Connect the workspace first."));
      const id = crypto.randomUUID();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.current.delete(id);
          reject(
            new Error("Workspace request timed out. Reload before retrying."),
          );
        }, 35_000);
        pending.current.set(id, { resolve, reject, timer });
        socket.current!.send(
          JSON.stringify({ ...payload, type: "command", id, op }),
        );
      });
    },
    [],
  );
  const flush = useCallback(async () => {
    if (flushing.current) await flushing.current;
    if (!drafts.current.size) return;
    const task = async () => {
      setSaving(true);
      try {
        while (drafts.current.size) {
          const [path, draft] = drafts.current.entries().next().value!;
          const { hash } = await request("write", {
            path,
            content: draft.content,
            hash: draft.hash,
          });
          const latest = drafts.current.get(path);
          if (latest?.version === draft.version) drafts.current.delete(path);
          else if (latest) latest.hash = String(hash);
          setFiles((current) =>
            current.map((file) =>
              file.path === path ? { ...file, hash: String(hash) } : file,
            ),
          );
        }
        setError("");
      } catch (reason) {
        setError(
          reason instanceof Error ? reason.message : "Couldn't save changes.",
        );
        throw reason;
      } finally {
        setSaving(false);
      }
    };
    flushing.current = task();
    try {
      await flushing.current;
    } finally {
      flushing.current = null;
    }
  }, [request]);
  const edit = useCallback(
    (file: WorkspaceFile, content: string) => {
      const old = drafts.current.get(file.path);
      drafts.current.set(file.path, {
        content,
        hash: old?.hash ?? file.hash,
        version: (old?.version || 0) + 1,
      });
      setFiles((current) =>
        current.map((item) =>
          item.path === file.path ? { ...item, content } : item,
        ),
      );
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(
        () => void flush().catch(() => undefined),
        600,
      );
    },
    [flush],
  );
  useEffect(() => {
    const preventLoss = (event: BeforeUnloadEvent) => {
      if (drafts.current.size) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", preventLoss);
    return () => {
      window.removeEventListener("beforeunload", preventLoss);
      clearTimeout(saveTimer.current);
    };
  }, []);
  const control = useCallback(
    async (action: "start" | "stop") => {
      if (action === "stop") await flush();
      const response = await fetch(`/api/projects/${projectId}/runtime`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, requestId: crypto.randomUUID() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setState(action === "start" ? "starting" : "stopping");
    },
    [projectId, flush],
  );
  const subscribe = useCallback((listener: (frame: RuntimeFrame) => void) => {
    listeners.current.add(listener);
    for (const frame of terminalHistory.current) listener(frame);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const queued = useCallback((id: string) => {
    jobs.current.add(id);
    setAgentBusy(true);
  }, []);
  const mutateFile = useCallback(
    async (op: "rename" | "delete", path: string, to?: string) => {
      await flush();
      const { hash } = await request("read", { path });
      await request(op, { path, to, hash });
    },
    [flush, request],
  );
  useEffect(() => {
    const reportActivity = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastActivitySent.current < 15_000) return;
      const ws = socket.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      lastActivitySent.current = now;
      ws.send(JSON.stringify({ type: "activity" }));
    };
    window.addEventListener("pointerdown", reportActivity, { passive: true });
    window.addEventListener("keydown", reportActivity);
    window.addEventListener("input", reportActivity);
    return () => {
      window.removeEventListener("pointerdown", reportActivity);
      window.removeEventListener("keydown", reportActivity);
      window.removeEventListener("input", reportActivity);
    };
  }, []);
  return {
    mode,
    files,
    folders,
    state,
    error,
    saving,
    agentBusy,
    queued,
    consoleLog,
    appRunning,
    previewUrl,
    edit,
    flush,
    request,
    control,
    subscribe,
    mutateFile,
  };
}
