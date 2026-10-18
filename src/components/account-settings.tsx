"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AccountShell, useCustomerAccount } from "./account-shell";

export function AccountSettings() {
  return (
    <AccountShell
      title="Your profile"
      description="A few details that make Runly yours."
    >
      <ProfileForm />
    </AccountShell>
  );
}
function ProfileForm() {
  const { account, loading, error } = useCustomerAccount();
  const [editedName, setName] = useState<string | null>(null);
  const [editedFullName, setFullName] = useState<string | null>(null);
  const name = editedName ?? account?.displayName ?? "";
  const fullName = editedFullName ?? account?.fullName ?? "";
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [remove, setRemove] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const previewUrl = useRef("");
  const [connectedNow, setGithubLinked] = useState(false);
  const githubLinked = connectedNow || Boolean(account?.githubLinked);
  useEffect(
    () => () => {
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    },
    [],
  );
  function updatePhoto(selected: File | null) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = selected ? URL.createObjectURL(selected) : "";
    setPreview(previewUrl.current);
    setFile(selected);
  }
  function chooseFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    event.target.value = "";
    if (!selected) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(selected.type) ||
      selected.size > 5 * 1024 * 1024
    ) {
      setFailed(true);
      setMessage("Choose a JPEG, PNG, or WebP image smaller than 5 MB.");
      return;
    }
    updatePhoto(selected);
    setRemove(false);
    setMessage("");
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
        body: JSON.stringify({ displayName: name, fullName }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (file) {
        const form = new FormData();
        form.set("avatar", file);
        const upload = await fetch("/api/account/avatar", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(30000),
        });
        const result = await upload.json();
        if (!upload.ok)
          throw new Error(
            `Your name was saved, but the photo wasn't: ${result.message}`,
          );
      } else if (remove && account?.avatarUrl) {
        const removal = await fetch("/api/account/avatar", {
          method: "DELETE",
          signal: AbortSignal.timeout(15000),
        });
        const result = await removal.json();
        if (!removal.ok)
          throw new Error(
            `Your name was saved, but the photo wasn't removed: ${result.message}`,
          );
      }
      updatePhoto(null);
      setRemove(false);
      setMessage("Profile saved.");
      window.dispatchEvent(new Event("runly-profile-updated"));
    } catch (e) {
      setFailed(true);
      setMessage(
        e instanceof Error
          ? e.message
          : "Couldn't save your profile. Try again.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  async function connectGithub() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/account/github", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message);
      if (data.url) window.location.assign(data.url);
      else {
        setGithubLinked(true);
        setMessage("GitHub connected.");
      }
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : "Couldn't connect GitHub.");
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  const avatar = remove ? "" : preview || account?.avatarUrl;
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "R";
  const changed =
    name !== (account?.displayName || "") ||
    fullName !== (account?.fullName || "") ||
    Boolean(file) ||
    remove;
  return (
    <>
      <form onSubmit={save} aria-busy={loading || pending}>
        <section className="account-section">
          <div className="account-row">
            <div className="account-photo">
              <span
                className="account-avatar"
                aria-hidden="true"
                style={
                  avatar ? { backgroundImage: `url(${avatar})` } : undefined
                }
              >
                {!avatar && initials}
              </span>
              <div>
                <strong>Profile photo</strong>
                <p>JPG, PNG, or WebP. Up to 5 MB.</p>
              </div>
            </div>
            <div className="account-photo-actions">
              <button
                className="account-button-secondary"
                type="button"
                disabled={loading || pending || Boolean(error)}
                onClick={() => input.current?.click()}
              >
                Upload photo
              </button>
              {avatar && (
                <button
                  className="account-button-secondary"
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    updatePhoto(null);
                    setRemove(true);
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          <input
            ref={input}
            className="account-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={chooseFile}
            disabled={loading || pending}
            tabIndex={-1}
            aria-label="Upload profile photo"
            aria-hidden="true"
          />
        </section>
        <section className="account-section">
          <h2>Personal information</h2>
          <div className="account-fields">
            <label className="account-field">
              Full name
              <input
                className="account-input"
                value={fullName}
                maxLength={120}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading || pending || Boolean(error)}
                autoComplete="name"
              />
              <small>Optional. Your name for your account records.</small>
            </label>
            <label className="account-field">
              Display name
              <input
                className="account-input"
                required
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                disabled={loading || pending || Boolean(error)}
                autoComplete="nickname"
              />
              <small>The name shown across Runly.</small>
            </label>
            <label className="account-field account-field-wide">
              Email address
              <input
                className="account-input"
                type="email"
                value={account?.email || ""}
                readOnly
                aria-label="Verified account email"
              />
              <small>
                {account ? "Verified · " : ""}Used for sign-in, receipts, and
                important account updates.
              </small>
            </label>
          </div>
          <div className="account-form-actions">
            <button
              className="account-button"
              disabled={loading || pending || !changed || !account}
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
          {message && (
            <div className="account-notice" role={failed ? "alert" : "status"}>
              {message}
            </div>
          )}
        </section>
      </form>
      <section className="account-section">
        <h2>Connected accounts</h2>
        <p>Manage the services you use to sign in.</p>
        <div className="account-row">
          <div>
            <strong>GitHub</strong>
            <p>
              {githubLinked
                ? "Connected to your Runly account."
                : "Use your GitHub account to sign in and connect repositories."}
            </p>
          </div>
          {githubLinked ? (
            <Link
              href="/settings/security"
              className="account-button-secondary"
            >
              Manage sign-in
            </Link>
          ) : (
            <button
              className="account-button-secondary"
              disabled={loading || pending || !account}
              onClick={connectGithub}
            >
              Connect GitHub
            </button>
          )}
        </div>
      </section>
      <section className="account-section">
        <div className="account-row">
          <div>
            <strong>Account data</strong>
            <p>Download your account details and project metadata as JSON.</p>
          </div>
          <a
            className="account-button-secondary"
            href="/api/account/export"
            download
          >
            Download account data
          </a>
        </div>
      </section>
    </>
  );
}
