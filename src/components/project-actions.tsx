"use client";

import { useId, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import styles from "./project-actions.module.css";

export function ProjectActions({
  project,
  onRename,
}: {
  project: { id: string; name: string };
  onRename: (name: string) => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const locked = useRef(false);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function open() {
    setName(project.name);
    setError("");
    dialog.current?.showModal();
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.select();
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (locked.current) return;
    if (!name.trim()) {
      setError("Give your project a name.");
      input.current?.focus();
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(
          result.message || "Couldn't save this change. Please retry.",
        );
      }
      const result = await response.json();
      onRename(result.project.name);
      dialog.current?.close();
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
        onClick={open}
      >
        <Pencil size={20} />
      </button>
      <dialog
        ref={dialog}
        className={`runly-dialog ${styles.dialog}`}
        aria-labelledby={`${id}-title`}
        onCancel={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <form noValidate onSubmit={submit}>
          <h2 id={`${id}-title`}>Rename project</h2>
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
          {error && (
            <p id={`${id}-error`} role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              type="button"
              className="button button-outline"
              disabled={busy}
              onClick={() => dialog.current?.close()}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button-dark"
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? "Saving…" : "Save name"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
