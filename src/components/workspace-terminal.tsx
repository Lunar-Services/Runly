"use client";

import { useEffect, useRef } from "react";
import type { RuntimeFrame } from "./use-project-runtime";
import "@xterm/xterm/css/xterm.css";
export function WorkspaceTerminal({
  ready,
  dark,
  request,
  subscribe,
}: {
  ready: boolean;
  dark: boolean;
  request: (
    op: string,
    payload?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  subscribe: (listener: (frame: RuntimeFrame) => void) => () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let dispose = () => {},
      cancelled = false;
    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")]).then(
      ([{ Terminal }, { FitAddon }]) => {
        if (cancelled || !container.current) return;
        const terminal = new Terminal({
          fontSize: 16,
          fontFamily: "Consolas, monospace",
          cursorBlink: true,
          scrollback: 2000,
          theme: dark
            ? { background: "#202020", foreground: "#ededed" }
            : { background: "#ffffff", foreground: "#242424" },
        });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(container.current);
        fit.fit();
        let buffer = "",
          timer: ReturnType<typeof setTimeout>;
        const input = terminal.onData((data) => {
          if (!ready) return;
          buffer += data;
          clearTimeout(timer);
          timer = setTimeout(() => {
            const chunk = buffer;
            buffer = "";
            void request("terminal.input", { data: chunk }).catch((error) =>
              terminal.writeln(`\r\n${error.message}`),
            );
          }, 20);
        });
        const unsubscribe = subscribe((frame) => {
          if (frame.type === "terminal.reset") terminal.reset();
          if (frame.type === "terminal.output")
            terminal.write(
              Uint8Array.from(atob(String(frame.data)), (character) =>
                character.charCodeAt(0),
              ),
            );
          if (frame.type === "terminal.exit")
            terminal.writeln(
              "\r\n[Shell exited. Reopen the Terminal to start another shell.]",
            );
        });
        const observer = new ResizeObserver(() => {
          fit.fit();
          if (ready)
            void request("terminal.resize", {
              cols: terminal.cols,
              rows: terminal.rows,
            }).catch(() => undefined);
        });
        observer.observe(container.current);
        if (ready)
          void request("terminal.open", {
            cols: terminal.cols,
            rows: terminal.rows,
          }).catch((error) => terminal.writeln(error.message));
        else terminal.writeln("Start the workspace to open a terminal.");
        dispose = () => {
          clearTimeout(timer);
          observer.disconnect();
          unsubscribe();
          input.dispose();
          terminal.dispose();
        };
      },
    );
    return () => {
      cancelled = true;
      dispose();
    };
  }, [ready, dark, request, subscribe]);
  return (
    <div
      className="workspace-live-terminal"
      ref={container}
      aria-label="Project terminal"
    />
  );
}
