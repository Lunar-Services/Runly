"use client";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "./app-shell";
import { Plus, Search, X } from "lucide-react";

type Project = { id: string; name: string; status: string; updated_at: string };
export function ProjectsDashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [reload, setReload] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects", { signal: controller.signal }).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.message); return result.projects; }).then(setProjects).catch(reason => { if (!controller.signal.aborted) setError(reason.message || "Couldn't load projects."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [reload]);
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setFormError("Give your project a name."); nameInput.current?.focus(); return; }
    if (lock.current) return;
    lock.current = true; setSaving(true); setFormError("");
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }), signal: AbortSignal.timeout(20000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setProjects(old => [result.project, ...old]); setName(""); dialog.current?.close();
    } catch (reason) { setFormError(reason instanceof Error ? reason.message : "Couldn't create the project."); }
    finally { lock.current = false; setSaving(false); }
  }
  const visible = projects.filter(project => project.name.toLowerCase().includes(query.toLowerCase()));
  return <AppShell title="Your projects">
    <div className="page-actions"><p className="muted">Your saved project records. AI generation and file editing are not enabled yet.</p><button className="button button-dark" onClick={() => dialog.current?.showModal()}><Plus size={16} />New project</button></div>
    <section className="panel"><div className="panel-head"><h2>Recent projects</h2><label className="search-field"><Search size={16} /><input aria-label="Search saved projects" placeholder="Search projects" value={query} onChange={event => setQuery(event.target.value)} />{query && <button aria-label="Clear project search" onClick={() => setQuery("")}><X size={16} /></button>}</label></div>
      {loading ? <div className="project-skeletons" role="status" aria-label="Loading projects">{[1,2,3].map(item => <div className="project-skeleton" key={item} />)}</div> : error ? <div className="empty-state"><p role="alert">{error}</p><button className="button button-outline" onClick={() => { setError(""); setLoading(true); setReload(value => value + 1); }}>Retry</button></div> : visible.length ? <div className="saved-projects">{visible.map(project => <article key={project.id}><h3>{project.name}</h3><p>Saved · {new Date(project.updated_at).toLocaleDateString()}</p><small>{project.status === "draft" ? "Draft project" : "Active project"}</small></article>)}</div> : <div className="empty-state"><h3>{query ? "No matching projects" : "Your next idea starts here."}</h3><p>{query ? "Try another name or clear your search." : "Create a named project and keep it in your account."}</p></div>}
      {projects.length === 100 && <p className="muted">Showing the 100 most recently updated projects.</p>}
    </section>
    <dialog ref={dialog} className="runly-dialog" aria-labelledby="create-project-title" onCancel={event => { if (saving) event.preventDefault(); }}><form noValidate onSubmit={create}><h2 id="create-project-title">A name for your idea.</h2><label htmlFor="project-name-input">Project name</label><input ref={nameInput} id="project-name-input" value={name} maxLength={160} onChange={event => setName(event.target.value)} disabled={saving} aria-invalid={!!formError} aria-describedby={formError ? "project-form-error" : undefined} />{formError && <p role="alert" id="project-form-error">{formError}</p>}<div className="button-row"><button type="button" className="button button-outline" disabled={saving} onClick={() => dialog.current?.close()}>Cancel</button><button className="button button-dark" disabled={saving} aria-busy={saving}>{saving ? "Creating…" : "Create project"}</button></div></form></dialog>
  </AppShell>;
}
