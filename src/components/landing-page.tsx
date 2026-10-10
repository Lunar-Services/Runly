"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUp,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Paperclip,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Brand } from "./brand";
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
  const router = useRouter();
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () => {
      header.current?.classList.toggle("is-scrolled", window.scrollY > 20);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  async function startBuilding(customPrompt?: string) {
    const textToSubmit = (customPrompt ?? prompt).trim();
    if (!textToSubmit) return;
    if (account) {
      setStartingProject(true);
      setMessage("");
      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: textToSubmit }),
          signal: AbortSignal.timeout(20_000),
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
                >
                  <Paperclip size={16} strokeWidth={2.2} />
                  <span className="attach-label">Add files or inspiration</span>
                </button>

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
      </main>

      <footer>
        <Brand />
        <p>A place for your next idea.</p>
        <div>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/pricing">Pricing</Link>
        </div>
        <small>© 2026 Runly</small>
      </footer>
    </div>
  );
}
