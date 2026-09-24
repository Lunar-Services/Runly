"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X } from "lucide-react";
import { AppShell } from "./app-shell";

export function AccountSettings() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const previewUrl = useRef("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        return result;
      })
      .then((result) => {
        setName(result.displayName);
        setEmail(result.email);
        setAvatarUrl(result.avatarUrl);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setFailed(true);
          setMessage(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );
  function chooseAvatar(file: File | null) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    const preview = file ? URL.createObjectURL(file) : "";
    previewUrl.current = preview;
    setAvatarFile(file);
    setAvatarPreview(preview);
  }
  function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (
      file &&
      (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 5 * 1024 * 1024)
    ) {
      setFailed(true);
      setMessage("Choose a JPEG, PNG, or WebP image smaller than 5 MB.");
      event.currentTarget.value = "";
      return;
    }
    chooseAvatar(file);
    setRemoveAvatar(false);
    setFailed(false);
    event.currentTarget.value = "";
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!name.trim()) {
      setFailed(true);
      setMessage("Enter a display name.");
      return;
    }
    lock.current = true;
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      if (avatarFile) {
        const form = new FormData();
        form.set("avatar", avatarFile);
        const upload = await fetch("/api/account/avatar", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(30000),
        });
        const uploadResult = await upload.json();
        if (!upload.ok) throw new Error(uploadResult.message);
        setAvatarUrl(uploadResult.avatarUrl);
        chooseAvatar(null);
      } else if (removeAvatar && avatarUrl) {
        const removal = await fetch("/api/account/avatar", {
          method: "DELETE",
          signal: AbortSignal.timeout(15000),
        });
        const removalResult = await removal.json();
        if (!removal.ok) throw new Error(removalResult.message);
        setAvatarUrl(removalResult.avatarUrl);
        setRemoveAvatar(false);
      }
      setMessage("Profile saved.");
      window.dispatchEvent(new Event("runly-profile-updated"));
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error ? error.message : "Couldn't save your account.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() ||
    email.slice(0, 1).toUpperCase() ||
    "R";
  const displayedAvatar = removeAvatar ? "" : avatarPreview || avatarUrl;
  return (
    <AppShell title="Account settings">
      <section className="panel form-panel profile-settings">
        <form
          className="profile-form"
          onSubmit={save}
          noValidate
          aria-busy={loading || pending}
        >
          <div className="profile-heading">
            <div className="profile-avatar-control">
              <button
                className="profile-avatar-edit"
                type="button"
                disabled={loading || pending}
                onClick={() => avatarInput.current?.click()}
                aria-label={
                  displayedAvatar
                    ? "Change profile picture"
                    : "Add profile picture"
                }
              >
                <span
                  className="profile-avatar profile-avatar-large profile-avatar-edit-image"
                  aria-hidden="true"
                  style={
                    displayedAvatar
                      ? { backgroundImage: `url(${displayedAvatar})` }
                      : undefined
                  }
                >
                  {!displayedAvatar && initials}
                </span>
                <span
                  className="profile-avatar-edit-overlay"
                  aria-hidden="true"
                >
                  <Pencil size={18} strokeWidth={2.5} />
                </span>
              </button>
              {displayedAvatar && (
                <button
                  className="profile-avatar-remove"
                  type="button"
                  disabled={loading || pending}
                  onClick={() => {
                    chooseAvatar(null);
                    setRemoveAvatar(true);
                  }}
                  aria-label="Remove profile picture"
                  title="Remove profile picture"
                >
                  <X size={14} strokeWidth={2.75} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="profile-heading-copy">
              <h2>Your profile</h2>
              <p className="muted">
                This is how your account appears inside Runly.
              </p>
            </div>
          </div>
          <input
            ref={avatarInput}
            className="profile-avatar-input"
            onChange={handleAvatarChange}
            disabled={loading || pending}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            tabIndex={-1}
          />
          <label>
            Display name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={120}
              disabled={loading || pending}
              autoComplete="name"
            />
          </label>
          <label>
            Email
            <input
              value={email}
              readOnly
              disabled
              aria-label="Verified account email"
            />
          </label>
          <button
            className="button button-dark"
            disabled={loading || pending || !email}
          >
            {loading ? "Loading…" : pending ? "Saving…" : "Save changes"}
          </button>
          {message && (
            <p className="inline-notice" role={failed ? "alert" : "status"}>
              {message}
            </p>
          )}
        </form>
      </section>
    </AppShell>
  );
}
