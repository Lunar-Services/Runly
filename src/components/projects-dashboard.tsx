"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  Code2,
  File,
  Film,
  Globe,
  Image as ImageIcon,
  Plus,
  Search,
  X,
} from "lucide-react";
import { CustomerHeader } from "./customer-header";
import { CustomerFooter } from "./customer-footer";
import { clearPendingBuild, getPendingBuild } from "@/lib/pending-build";
import { projectTemplates, projectLanguages } from "@/lib/project-templates";
import "./account.css";
import styles from "./projects-dashboard.module.css";

type Project = { id: string; name: string; status: string; updated_at: string };

export function ProjectsDashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [revision, setRevision] = useState(0);
  const resumedDraft = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/projects", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message || "Couldn't load your projects.");
        return result.projects;
      })
      .then(setProjects)
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason.message || "Couldn't load your projects.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (resumedDraft.current) return;
    resumedDraft.current = true;
    async function resumeDraft() {
      const prompt = sessionStorage.getItem("runly:draft-prompt");
      if (!prompt) return;
      const pending = await getPendingBuild();
      const form = new FormData();
      form.set("prompt", pending?.prompt || prompt);
      pending?.files.forEach((file) => form.append("files", file, file.name));
      const response = await fetch("/api/projects", {
        method: "POST",
        body: pending?.files.length
          ? form
          : JSON.stringify({ prompt: pending?.prompt || prompt }),
        headers: pending?.files.length
          ? undefined
          : { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(120000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      await clearPendingBuild();
      sessionStorage.removeItem("runly:draft-prompt");
      router.replace(`/project/${result.project.id}`);
    }
    void resumeDraft().catch((reason) =>
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't continue your idea.",
      ),
    );
  }, [router]);
  const visible = projects.filter((project) =>
    project.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <div className={`customer-account ${styles.page}`}>
      <CustomerHeader showNavigation={false} />
      <main id="customer-content" className={styles.main}>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Workspace</p>
            <h1>Your projects.</h1>
            <p>Your projects, templates, and repositories in one workspace.</p>
          </div>
          <Link className="account-button" href="/dashboard/projects/new">
            <Plus size={18} />
            Create new
          </Link>
        </header>
        <section aria-labelledby="projects-heading">
          <div className={styles.listHeading}>
            <h2 id="projects-heading">
              Recent projects
              {!loading && !error && <span>{projects.length}</span>}
            </h2>
            <label className={styles.search}>
              <Search size={18} aria-hidden="true" />
              <input
                aria-label="Search projects"
                placeholder="Search projects"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X size={17} />
                </button>
              )}
            </label>
          </div>
          {loading ? (
            <p className={styles.empty} role="status">
              Loading your projects…
            </p>
          ) : error ? (
            <div className={styles.empty}>
              <p role="alert">{error}</p>
              <button
                className="account-button-secondary"
                onClick={() => {
                  setError("");
                  setLoading(true);
                  setRevision((value) => value + 1);
                }}
              >
                Try again
              </button>
            </div>
          ) : visible.length ? (
            <div className={styles.projects}>
              {visible.map((project) => (
                <Link
                  className={styles.project}
                  href={`/project/${project.id}`}
                  key={project.id}
                >
                  <span className={styles.projectIcon}>
                    <Code2 size={24} />
                  </span>
                  <div>
                    <h3>{project.name}</h3>
                    <p>
                      Updated{" "}
                      {new Date(project.updated_at).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </p>
                  </div>
                  <span className={styles.projectBottom}>
                    <span>
                      {project.status === "draft" ? "Draft" : "Active"}
                    </span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className={styles.empty}>
              <h3>
                {query
                  ? "No projects match your search."
                  : "Start with something small."}
              </h3>
              <p>
                {query
                  ? "Try another project name."
                  : "Choose a web application template or begin with an empty repository."}
              </p>
              {query ? (
                <button
                  className="account-button-secondary"
                  onClick={() => setQuery("")}
                >
                  Clear search
                </button>
              ) : (
                <Link className="account-button" href="/dashboard/projects/new">
                  Create your first project
                </Link>
              )}
            </div>
          )}
          {projects.length === 100 && (
            <p className={styles.note}>
              Showing your 100 most recently updated projects.
            </p>
          )}
        </section>
        <aside className={styles.supportBar} aria-label="Workspace help">
          <p>Need a hand?</p>
          <Link href="/support">
            Get support <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </aside>
      </main>
      <CustomerFooter />
    </div>
  );
}

const icons = { empty: File, web: Globe, video: Film, image: ImageIcon };
export function ProjectTemplatesPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("empty");
  const [language, setLanguage] = useState("javascript");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [idea, setIdea] = useState("");
  const [deciding, setDeciding] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const [recommendation, setRecommendation] = useState("");
  const decisionLock = useRef(false);
  const lock = useRef(false);
  const template = projectTemplates.find((item) => item.id === selected)!;
  const visible = projectTemplates.filter((item) =>
    `${item.name} ${item.description}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  async function decide(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!idea.trim() || decisionLock.current || pending) return;
    decisionLock.current = true;
    setDeciding(true);
    setDecisionError("");
    setRecommendation("");
    try {
      const response = await fetch("/api/projects/recommend-stack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: idea.trim() }),
        signal: AbortSignal.timeout(45000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message || "Couldn't recommend a stack. Try again.",
        );
      const suggested = projectTemplates.find(
        (item) =>
          item.id === result.template &&
          item.available &&
          item.languages.includes(result.language),
      );
      if (!suggested)
        throw new Error(
          "The suggested stack isn't available. Please try again.",
        );
      setSelected(result.template);
      setLanguage(result.language);
      setQuery("");
      setName((current) => (current.trim() ? current : result.name));
      setRecommendation(
        `${result.mode === "mock" ? "Local demo recommendation: " : "Runly recommends: "}${result.reason}`,
      );
    } catch (reason) {
      setDecisionError(
        reason instanceof Error
          ? reason.message
          : "Couldn't recommend a stack. Try again.",
      );
    } finally {
      decisionLock.current = false;
      setDeciding(false);
    }
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (lock.current || decisionLock.current) return;
    if (!name.trim()) {
      setError("Give your project a name.");
      return;
    }
    lock.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          template: selected,
          language,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't create your project.");
      router.push(`/project/${result.project.id}`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Couldn't create your project. Try again.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <div className={`customer-account ${styles.page}`}>
      <CustomerHeader showNavigation={false} />
      <main id="customer-content" className={styles.main}>
        <Link className={styles.back} href="/dashboard/projects">
          <ArrowLeft size={17} />
          Back to workspace
        </Link>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Create new</p>
            <h1>A starting point for your idea.</h1>
            <p>Start from a template or an empty project. No local setup.</p>
          </div>
        </header>
        <section className={styles.decide} aria-labelledby="decide-heading">
          <h2 id="decide-heading">Decide for me</h2>
          <p className={styles.note}>
            Tell Runly what you want to make. It will choose a template and
            language, and explain why.
          </p>
          <form
            className={styles.ideaComposer}
            onSubmit={decide}
            aria-busy={deciding}
          >
            <label className={styles.ideaLabel} htmlFor="project-idea">
              Your idea
            </label>
            <textarea
              id="project-idea"
              placeholder="A booking website for my studio, where clients can choose a time and manage their appointments…"
              value={idea}
              maxLength={2000}
              minLength={10}
              required
              disabled={deciding || pending}
              onChange={(event) => {
                setIdea(event.target.value);
                setRecommendation("");
                setDecisionError("");
              }}
            />
            <div className={styles.ideaActions}>
              <button
                className="account-button"
                disabled={!idea.trim() || deciding || pending}
              >
                {deciding ? "Choosing your stack…" : "Create Project"}
                <ArrowUpRight size={17} />
              </button>
            </div>
          </form>
          {recommendation && (
            <p className={styles.recommendation} role="status">
              {recommendation}
            </p>
          )}
          {decisionError && (
            <p className="account-notice" role="alert">
              {decisionError}
            </p>
          )}
        </section>
        <div className={styles.templateLayout}>
          <section aria-labelledby="templates-heading">
            <div className={styles.templateHeading}>
              <h2 id="templates-heading">Templates</h2>
              <label className={styles.search}>
                <Search size={18} />
                <input
                  aria-label="Search templates"
                  placeholder="Search templates"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear template search"
                    onClick={() => setQuery("")}
                  >
                    <X size={17} />
                  </button>
                )}
              </label>
            </div>
            <div className={styles.templates}>
              {visible.map((item) => {
                const Icon = icons[item.id as keyof typeof icons];
                return (
                  <button
                    type="button"
                    key={item.id}
                    className={`${styles.template} ${selected === item.id ? styles.selected : ""}`}
                    aria-pressed={selected === item.id}
                    disabled={!item.available || pending || deciding}
                    onClick={() => {
                      setSelected(item.id);
                      setError("");
                      if (!item.languages.some((value) => value === language))
                        setLanguage(item.languages[0]);
                    }}
                  >
                    <Icon size={28} strokeWidth={1.6} />
                    <span className={styles.templateTitle}>{item.name}</span>
                    <span className={styles.templateDescription}>
                      {item.description}
                    </span>
                    <span className={styles.templateStatus}>
                      {!item.available
                        ? "Coming soon"
                        : selected === item.id
                          ? "Selected"
                          : "Choose template"}
                    </span>
                  </button>
                );
              })}
            </div>
            {visible.length === 0 && (
              <div className={styles.empty}>
                <p>No matching templates.</p>
                <button
                  className="account-button-secondary"
                  onClick={() => setQuery("")}
                >
                  Clear search
                </button>
              </div>
            )}
          </section>
          <form
            className={styles.configuration}
            onSubmit={create}
            aria-busy={pending}
          >
            <p className={styles.eyebrow}>Your project</p>
            <h2>{template.name}</h2>
            <p className={styles.note}>
              {selected === "empty"
                ? "A blank repository with a README. Add your own files and tools."
                : "A runnable starter with the files and development command ready to use."}
            </p>
            <label className="account-field">
              Project name
              <input
                className="account-input"
                placeholder="My next idea"
                autoComplete="off"
                required
                maxLength={160}
                value={name}
                disabled={pending || deciding}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="account-field">
              Language
              <select
                className="account-input"
                value={language}
                disabled={pending || deciding}
                onChange={(event) => setLanguage(event.target.value)}
              >
                {projectLanguages
                  .filter((item) =>
                    template.languages.some((value) => value === item.id),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
              </select>
            </label>
            <p className={styles.note}>
              {selected === "empty"
                ? "The language is a starting preference. No application or dependencies are added."
                : language === "html"
                  ? "HTML and CSS with a small Node.js development server."
                  : `Next.js with ${language === "typescript" ? "TypeScript" : "JavaScript"} and React.`}
            </p>
            {error && (
              <p className="account-notice" role="alert">
                {error}
              </p>
            )}
            <button className="account-button" disabled={pending || deciding}>
              {pending ? "Creating project…" : "Create project"}
              <ArrowUpRight size={17} />
            </button>
            <Link className={styles.cancel} href="/dashboard/projects">
              Cancel
            </Link>
          </form>
        </div>
      </main>
      <CustomerFooter />
    </div>
  );
}
