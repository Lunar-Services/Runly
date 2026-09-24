"use client";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "./app-shell";

export function AccountSettings() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account", { signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result; }).then(result => { setName(result.displayName); setEmail(result.email); setAvatarUrl(result.avatarUrl); }).catch(error => { if (!controller.signal.aborted) { setFailed(true); setMessage(error.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    if (!name.trim()) { setFailed(true); setMessage("Enter a display name."); return; }
    lock.current = true; setPending(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: name, avatarUrl }), signal: AbortSignal.timeout(15000) });
      const result = await response.json(); if (!response.ok) throw new Error(result.message); setMessage(result.message);
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Couldn't save your account."); }
    finally { lock.current = false; setPending(false); }
  }
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || email.slice(0, 1).toUpperCase() || "R";
  return <AppShell title="Account settings"><section className="panel form-panel profile-settings"><form onSubmit={save} noValidate aria-busy={loading || pending}><div className="profile-heading"><div className="profile-avatar profile-avatar-large" role="img" aria-label={avatarUrl ? `${name || "Account"} profile picture` : `${name || "Account"} initials`} style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}>{!avatarUrl && initials}</div><div><h2>Your profile</h2><p className="muted">This is how your account appears inside Runly.</p></div></div><label>Display name<input value={name} onChange={event => setName(event.target.value)} maxLength={120} disabled={loading || pending} autoComplete="name" /></label><label>Profile picture URL<input value={avatarUrl} onChange={event => setAvatarUrl(event.target.value)} maxLength={2048} disabled={loading || pending} type="url" inputMode="url" placeholder="https://example.com/photo.jpg" aria-describedby="avatar-help" /></label><p className="field-help" id="avatar-help">Use a direct http or https image link. Leave it empty to show your initials.</p><label>Email<input value={email} readOnly disabled aria-label="Verified account email" /></label><button className="button button-dark" disabled={loading || pending || !email}>{loading ? "Loading…" : pending ? "Saving…" : "Save changes"}</button>{message && <p className="inline-notice" role={failed ? "alert" : "status"}>{message}</p>}</form></section></AppShell>;
}
