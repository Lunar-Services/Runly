"use client";

import { useId, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import styles from "./project-actions.module.css";

export function ProjectActions({
  project,
  onRename,
  onDelete,
}: {
  project: { id: string; name: string };
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const locked = useRef(false);
  const [action, setAction] = useState<"rename" | "delete">("rename");
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function open(next: "rename" | "delete") {
    setAction(next);
    setName(project.name);
    setError("");
    dialog.current?.showModal();
    requestAnimationFrame(() => {
      if (next === "delete") cancel.current?.focus();
      else {
        input.current?.focus();
        input.current?.select();
      }
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    if (action === "rename" && !name.trim()) {
      setError("Give your project a name.");
      input.current?.focus();
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: action === "rename" ? "PATCH" : "DELETE",
        ...(action === "rename"
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: name.trim() }),
            }
          : {}),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          result.message || "Couldn't save this change. Please retry.",
        );
      }
      if (action === "rename") {
        const result = await response.json();
        onRename(result.project.name);
      }
      dialog.current?.close();
      if (action === "delete") onDelete();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't save this change. Please retry.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <div className={styles.actions}>
      <button
        type="button"
        aria-label={`Rename ${project.name}`}
        title="Rename project"
        onClick={() => open("rename")}
      >
        <Pencil size={20} />
      </button>
      <button
        type="button"
        aria-label={`Delete ${project.name}`}
        title="Delete project"
        onClick={() => open("delete")}
      >
        <Trash2 size={20} />
      </button>
      <dialog
        ref={dialog}
        className={`runly-dialog ${styles.dialog}`}
        aria-labelledby={`${id}-title`}
        aria-describedby={action === "delete" ? `${id}-description` : undefined}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <form noValidate onSubmit={submit}>
          <h2 id={`${id}-title`}>
            {action === "rename" ? "Rename project" : "Delete project?"}
          </h2>
          {action === "rename" ? (
            <>
              <label htmlFor={`${id}-name`}>Project name</label>
              <input
                ref={input}
                id={`${id}-name`}
                value={name}
                maxLength={160}
                disabled={busy}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={!!error}
                aria-describedby={error ? `${id}-error` : undefined}
              />
            </>
          ) : (
            <p id={`${id}-description`}>
              Delete <strong>{project.name}</strong> and its saved files and
              conversations? This cannot be undone. Your account subscription
              will remain unchanged.
            </p>
          )}
          {error && (
            <p id={`${id}-error`} role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              ref={cancel}
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`button ${action === "delete" ? styles.danger : "button-dark"}`}
              disabled={busy}
              aria-busy={busy}
            >
              {busy
                ? "Saving…"
                : action === "rename"
                  ? "Save name"
                  : "Delete project"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
