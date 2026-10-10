"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUp,
  ChevronDown,
  Film,
  Globe,
  LayoutDashboard,
  LogOut,
  Paperclip,
  Smartphone,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Brand } from "./brand";
import { savePendingBuild } from "@/lib/pending-build";
import "./landing.css";

export function LandingPage({
  account,
}: {
  account: { email: string; displayName: string; avatarUrl: string } | null;
}) {
  const [prompt, setPrompt] = useState("");
  const [message, setMessage] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [startingProject, setStartingProject] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const router = useRouter();
  const header = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const update = () => {
      header.current?.classList.toggle("is-scrolled", window.scrollY > 20);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  async function startBuilding(customPrompt?: string) {
    const textToSubmit =
      (customPrompt ?? prompt).trim() ||
      (attachments.length
        ? "Use the attached files as inspiration for a new project."
        : "");
    if (!textToSubmit) return;
    if (account) {
      setStartingProject(true);
      setMessage("");
      try {
        const form = new FormData();
        form.set("prompt", textToSubmit);
        attachments.forEach((file) => form.append("files", file, file.name));
        const response = await fetch("/api/projects", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(120_000),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message);
        router.push(`/project/${result.project.id}`);
      } catch (error) {
        setMessage(
          error instanceof Error
            ? error.message
            : "Couldn't create the project.",
        );
        setStartingProject(false);
      }
      return;
    }
    try {
      await savePendingBuild({ prompt: textToSubmit, files: attachments });
      sessionStorage.setItem("runly:draft-prompt", textToSubmit);
      router.push("/signup?intent=build");
    } catch {
      setMessage(
        "Your browser couldn't save the idea. Allow site storage and try again.",
      );
    }
  }

  async function signOut() {
    setSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Couldn't sign out.");
      setAccountMenuOpen(false);
      router.replace("/");
      router.refresh();
    } catch {
      setMessage("Couldn't sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  function chooseFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const added = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!added.length) return;
    const next = [...attachments, ...added];
    if (next.length > 5) {
      setMessage("Add up to five files.");
      return;
    }
    if (next.some((file) => file.size > 8 * 1024 * 1024)) {
      setMessage("Each file must be 8 MB or smaller.");
      return;
    }
    if (next.reduce((total, file) => total + file.size, 0) > 20 * 1024 * 1024) {
      setMessage("Keep the total upload size under 20 MB.");
      return;
    }
    setAttachments(next);
    setMessage("");
  }

  const initials =
    account?.displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() ||
    account?.email.slice(0, 1).toUpperCase() ||
    "R";

  return (
    <div className="marketing-shell cat-site">
      <header className="site-header" ref={header}>
        <div className="site-header-inner">
          <div className="brand-wrapper">
            <Brand />
          </div>
          <nav
            id="main-navigation"
            className="nav-pill"
            aria-label="Main navigation"
          >
            <a href="#create">Create</a>
            <a href="#how-it-works">How it works</a>
            <a href="#explore">Explore</a>
          </nav>
          <div className="nav-actions">
            {account ? (
              <div className="account-menu">
                <button
                  className="account-menu-trigger"
                  type="button"
                  onClick={() => setAccountMenuOpen((open) => !open)}
                  aria-expanded={accountMenuOpen}
                  aria-controls="account-menu-options"
                  aria-label="Open account menu"
                >
                  <span
                    className="account-menu-avatar"
                    style={
                      account.avatarUrl
                        ? { backgroundImage: `url(${account.avatarUrl})` }
                        : undefined
                    }
                  >
                    {!account.avatarUrl && initials}
                  </span>
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
                {accountMenuOpen && (
                  <div
                    className="account-menu-panel"
                    id="account-menu-options"
                    role="menu"
                  >
                    <Link
                      href="/dashboard"
                      role="menuitem"
                      onClick={() => setAccountMenuOpen(false)}
                    >
                      <LayoutDashboard size={15} aria-hidden="true" />
                      <span>Workspace</span>
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={signOut}
                      disabled={signingOut}
                    >
                      <LogOut size={15} aria-hidden="true" />
                      <span>{signingOut ? "Signing out…" : "Sign out"}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/login" className="nav-login-link">
                  Log in
                </Link>
                <Link href="/signup" className="nav-cta-pill">
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="sky-hero-section" id="create">
          <div className="sky-hero-container">
            <h1 className="sky-hero-title">
              From what if
              <br />
              <span className="sky-hero-serif">to there it is.</span>
            </h1>

            <p className="sky-hero-subtitle">
              <span className="subtitle-desktop">
                Edit a video. Build a website. Bring an app to life.
                <br />
                Your ideas, made real through a conversation.
              </span>
              <span className="subtitle-mobile">
                Videos, websites, and apps.
                <br />
                Made through a conversation.
              </span>
            </p>

            <form
              className="sky-composer"
              onSubmit={(event) => {
                event.preventDefault();
                startBuilding();
              }}
            >
              <textarea
                className="sky-textarea"
                rows={2}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    startBuilding();
                  }
                }}
                placeholder="What would you like to create?"
                aria-label="What would you like to create?"
              />

              <div className="sky-composer-footer">
                <button
                  type="button"
                  className="sky-attach-btn"
                  aria-label="Add files or inspiration"
                  aria-controls="landing-file-input"
                  disabled={startingProject}
                  onClick={() => fileInput.current?.click()}
                >
                  <Paperclip size={16} strokeWidth={2.2} />
                  <span className="attach-label">Add files or inspiration</span>
                </button>
                <input
                  ref={fileInput}
                  id="landing-file-input"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,application/pdf,text/plain,text/markdown,text/csv,application/json"
                  onChange={chooseFiles}
                  hidden
                />

                <button
                  className="sky-send-btn"
                  type="submit"
                  disabled={!prompt.trim() || startingProject}
                  aria-busy={startingProject}
                  aria-label="Start building"
                >
                  <ArrowUp size={18} strokeWidth={2.5} />
                </button>
              </div>
            </form>

            {attachments.length > 0 && (
              <ul
                className="landing-attachment-list"
                aria-label="Attached files"
              >
                {attachments.map((file, index) => (
                  <li
                    className="landing-attachment"
                    key={`${file.name}-${file.lastModified}-${index}`}
                  >
                    <span title={file.name}>{file.name}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${file.name}`}
                      disabled={startingProject}
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter((_, fileIndex) => fileIndex !== index),
                        )
                      }
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {message && (
              <p role="alert" className="cat-error">
                {message}
              </p>
            )}
            <div className="sky-suggestions">
              <button
                type="button"
                className="sky-suggestion-pill"
                onClick={() => {
                  setPrompt("Edit a video");
                }}
              >
                <span className="pill-desktop">Edit a video</span>
                <span className="pill-mobile">Video</span>
              </button>
              <button
                type="button"
                className="sky-suggestion-pill"
                onClick={() => {
                  setPrompt("Build a website");
                }}
              >
                <span className="pill-desktop">Build a website</span>
                <span className="pill-mobile">Website</span>
              </button>
              <button
                type="button"
                className="sky-suggestion-pill"
                onClick={() => {
                  setPrompt("Create an app");
                }}
              >
                <span className="pill-desktop">Create an app</span>
                <span className="pill-mobile">App</span>
              </button>
            </div>

            <p className="sky-hero-footnote">
              One workspace. Every kind of idea.
            </p>
          </div>
        </section>
        <section id="how-it-works" className="product-section">
          <div className="product-hero-image-wrapper">
            <Image
              src="/e.png"
              alt="Runly workspace preview"
              width={1024}
              height={499}
              className="product-hero-image product-hero-image-desktop"
              priority
            />
            <Image
              src="/e-mobile.png"
              alt="Runly workspace preview on mobile"
              width={700}
              height={752}
              className="product-hero-image product-hero-image-mobile"
              priority
            />
          </div>
        </section>
        <section className="features-section">
          <div className="features-container">
            <div className="features-left">
              <h2 className="features-title">
                <span className="title-desktop">
                  Big ideas.
                  <br />
                  No blank-page feeling.
                </span>
                <span className="title-mobile">
                  Big ideas.
                  <br />A place to begin.
                </span>
              </h2>

              <p className="features-subtitle">
                <span className="subtitle-desktop">
                  Start anywhere. Keep creating in the same conversation.
                </span>
                <span className="subtitle-mobile">
                  Edit a video, build your website, or bring an app to life.
                  Runly follows your lead.
                </span>
              </p>
              <div className="features-list features-list-desktop">
                <div className="feature-item">
                  <div className="feature-icon">
                    <Film size={20} strokeWidth={2} />
                  </div>
                  <div className="feature-text">
                    <h3>Videos with your vision.</h3>
                    <p>Trim, caption, and shape your story.</p>
                  </div>
                </div>

                <div className="feature-item">
                  <div className="feature-icon">
                    <Globe size={20} strokeWidth={2} />
                  </div>
                  <div className="feature-text">
                    <h3>Websites with your signature.</h3>
                    <p>Go from a prompt to your own corner of the web.</p>
                  </div>
                </div>

                <div className="feature-item">
                  <div className="feature-icon">
                    <Smartphone size={20} strokeWidth={2} />
                  </div>
                  <div className="feature-text">
                    <h3>Apps with a purpose.</h3>
                    <p>Turn a useful idea into something people can use.</p>
                  </div>
                </div>
              </div>
              <div className="mobile-steps-list">
                <div className="mobile-step-item">
                  <span className="mobile-step-num">01</span>
                  <div className="mobile-step-content">
                    <h3>Bring the idea</h3>
                    <p>Start with a prompt or your own files.</p>
                  </div>
                </div>

                <div className="mobile-step-item">
                  <span className="mobile-step-num">02</span>
                  <div className="mobile-step-content">
                    <h3>Make it yours</h3>
                    <p>Keep refining through conversation.</p>
                  </div>
                </div>

                <div className="mobile-step-item">
                  <span className="mobile-step-num">03</span>
                  <div className="mobile-step-content">
                    <h3>Put it out there</h3>
                    <p>Review, publish, or export your work.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="features-right">
              <div className="sky-card">
                <div className="sky-card-overlay">
                  <p className="sky-card-headline">
                    a little closer
                    <br />
                    to the sky.
                  </p>
                  <span className="sky-card-tag">Offline Weekends</span>
                </div>
              </div>
              <div className="sky-card-caption">
                <p className="sky-card-quote">
                  “Make this feel like a weekend away.”
                </p>
                <p className="sky-card-sub">
                  A sample edit, created through conversation.
                </p>
              </div>
            </div>
          </div>
        </section>
        <section className="creation-section">
          <div className="creation-container">
            <h2 className="creation-title">
              A thought. A conversation. A creation.
            </h2>

            <div className="creation-grid">
              <div className="creation-col">
                <span className="creation-num">01</span>
                <h3 className="creation-heading">Bring the idea</h3>
                <p className="creation-desc">
                  Describe it, upload your files,
                  <br className="desktop-break" />
                  or share something that inspires you.
                </p>
              </div>

              <div className="creation-col">
                <span className="creation-num">02</span>
                <h3 className="creation-heading">Make it yours</h3>
                <p className="creation-desc">
                  Give feedback in plain language.
                  <br className="desktop-break" />
                  See the result take shape beside your chat.
                </p>
              </div>

              <div className="creation-col">
                <span className="creation-num">03</span>
                <h3 className="creation-heading">Put it out there</h3>
                <p className="creation-desc">
                  Review the details, then publish
                  <br className="desktop-break" />
                  your site or app, or export your video.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-container">
          <div className="footer-cta-row">
            <h2 className="footer-cta-title">
              {/* font-family:  Georgia, "Playfair Display", Cambria, serif; */}
              <span className="footer-title-desktop">
                Your next idea starts here.
              </span>
              <span className="footer-title-mobile">
                Make your next idea real.
              </span>
            </h2>

            <Link href="#create" className="footer-cta-button">
              Start creating
            </Link>
          </div>

          <div className="footer-divider" />
          <div className="footer-bottom-row">
            <div className="footer-brand-group">
              <Brand />
              <span className="footer-tagline">Made for what comes next.</span>
            </div>

            <div className="footer-links">
              <Link href="/" className="footer-mobile-brand-link">
                Runly
              </Link>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/contact">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
