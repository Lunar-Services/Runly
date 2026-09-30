"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import styles from "./project-actions.module.css";

export function ProjectActions({
  project,
  onRename,
  onDelete,
}: {
  project: { id: string; name: string; deletion_requested_at?: string | null };
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const deleteController = useRef<AbortController | null>(null);
  const locked = useRef(false);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteStage, setDeleteStage] = useState("");

  useEffect(() => () => deleteController.current?.abort(), []);

  async function remove(retry = false) {
    if (deleteBusy) return;
    const controller = new AbortController();
    deleteController.current = controller;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      for (let attempt = 0; attempt < 90; attempt++) {
        const response = await fetch(
          `/api/projects/${project.id}${retry ? "?retry=1" : ""}`,
          {
            method: "DELETE",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20000),
            ]),
          },
        );
        retry = false;
        if (response.status === 204) {
          deleteDialog.current?.close();
          onDelete();
          return;
        }
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message || "Couldn't delete this project.");
        setDeleteStage(
          result.state === "waiting-for-task"
            ? "Waiting for the active task to finish…"
            : "Stopping and backing up the sandbox…",
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
        if (controller.signal.aborted) return;
      }
      setDeleteError(
        "Cleanup is still running. You can return and finish deletion later.",
      );
    } catch (reason) {
      if (!controller.signal.aborted)
        setDeleteError(
          reason instanceof Error
            ? reason.message
            : "Couldn't delete this project.",
        );
    } finally {
      setDeleteBusy(false);
      deleteController.current = null;
    }
  }

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
      {!project.deletion_requested_at && (
        <button
          type="button"
          aria-label={`Rename ${project.name}`}
          title="Rename project"
          onClick={open}
        >
          <Pencil size={20} />
        </button>
      )}
      <button
        type="button"
        aria-label={`${project.deletion_requested_at ? "Finish deleting" : "Delete"} ${project.name}`}
        title={
          project.deletion_requested_at ? "Finish deletion" : "Delete project"
        }
        onClick={() => {
          setDeleteError("");
          setDeleteStage("");
          deleteDialog.current?.showModal();
        }}
      >
        <Trash2 size={20} />
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
      <dialog
        ref={deleteDialog}
        className={`runly-dialog ${styles.dialog}`}
        aria-labelledby={`${id}-delete-title`}
        onCancel={(event) => {
          if (deleteBusy) event.preventDefault();
        }}
      >
        <h2 id={`${id}-delete-title`}>Delete {project.name}?</h2>
        <p>
          The sandbox will stop and save its last file changes before the
          project, files, and chats are removed. Usage records remain on your
          account.
        </p>
        {deleteStage && <p role="status">{deleteStage}</p>}
        {deleteError && <p role="alert">{deleteError}</p>}
        <div className="button-row">
          <button
            type="button"
            className="button button-outline"
            disabled={deleteBusy}
            onClick={() => deleteDialog.current?.close()}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`button ${styles.danger}`}
            disabled={deleteBusy}
            onClick={() => void remove(!!deleteError)}
          >
            {deleteBusy
              ? "Deleting…"
              : project.deletion_requested_at
                ? "Finish deletion"
                : "Delete project"}
          </button>
        </div>
      </dialog>
    </div>
  );
}
