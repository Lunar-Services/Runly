"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { CustomerFooter } from "./customer-footer";
import { CustomerHeader } from "./customer-header";
import { LandingShowcase } from "./landing-showcase";
import { LandingMotion } from "./landing-motion";
import { SkyBackground, useLocalSky, type SkyPhase } from "./sky-background";
import { savePendingBuild } from "@/lib/pending-build";
import "./landing.css";

type Account = { email: string; displayName: string; avatarUrl: string } | null;

const suggestions = [
  {
    href: "/create?idea=video",
    icon: "/figma/landing/video.svg",
    label: "Plan a video",
  },
  {
    href: "/create?idea=website",
    icon: "/figma/landing/globe.svg",
    label: "Build a website",
  },
  {
    href: "/create?idea=app",
    icon: "/figma/landing/app.svg",
    label: "Create an app",
  },
] as const;

export function LandingPage({
  account,
  createOnly = false,
  initialPrompt = "",
  skyPreview,
}: {
  account: Account;
  createOnly?: boolean;
  initialPrompt?: string;
  skyPreview?: SkyPhase;
}) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const skyPhase = useLocalSky(skyPreview);
  const [message, setMessage] = useState("");
  const [startingProject, setStartingProject] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const submissionLock = useRef(false);
  const heroContent = useRef<HTMLDivElement>(null);
  const [heroExited, setHeroExited] = useState(false);
  useEffect(() => {
    const content = heroContent.current;
    if (!content) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let exitTimer = 0;
    let wasExited = false;
    function update() {
      frame = 0;
      const hero = content!.parentElement;
      const threshold = Math.min(
        160,
        (hero?.offsetHeight || window.innerHeight) * 0.18,
      );
      const progress = motion.matches
        ? 0
        : window.scrollY - (hero?.offsetTop || 0) > threshold
          ? 1
          : 0;
      // Keep a focused composer visible and usable for keyboard users.
      const visibleProgress = content!.contains(document.activeElement)
        ? 0
        : progress;
      content!.style.setProperty("--hero-exit", String(visibleProgress));
      content!.inert = visibleProgress === 1;
      const exited = visibleProgress === 1;
      if (exited !== wasExited) {
        wasExited = exited;
        window.clearTimeout(exitTimer);
        if (exited)
          exitTimer = window.setTimeout(() => setHeroExited(true), 450);
        else setHeroExited(false);
      }
    }
    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    motion.addEventListener("change", schedule);
    content.addEventListener("focusin", schedule);
    content.addEventListener("focusout", schedule);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(exitTimer);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      motion.removeEventListener("change", schedule);
      content.removeEventListener("focusin", schedule);
      content.removeEventListener("focusout", schedule);
      content.style.removeProperty("--hero-exit");
      content.inert = false;
    };
  }, []);

  async function startBuilding(customPrompt?: string) {
    const textToSubmit =
      (customPrompt ?? prompt).trim() ||
      (attachments.length
        ? "Use the attached files as inspiration for a new project."
        : "");
    if (!textToSubmit || submissionLock.current) return;
    submissionLock.current = true;
    setStartingProject(true);
    if (account) {
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
        submissionLock.current = false;
      }
      return;
    }
    try {
      await savePendingBuild({ prompt: textToSubmit, files: attachments });
      sessionStorage.setItem("runly:draft-prompt", textToSubmit);
      router.push("/signup?intent=build");
    } catch {
      submissionLock.current = false;
      setStartingProject(false);
      setMessage(
        "Your browser couldn't save the idea. Allow site storage and try again.",
      );
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

  return (
    <div className="marketing-shell marketing-site" data-sky={skyPhase}>
      <SkyBackground phase={skyPhase} />
      {skyPreview && (
        <nav className="sky-preview-controls" aria-label="Sky time preview">
          <span>Sky preview</span>
          {(["dawn", "day", "sunset", "night"] as const).map((phase) => (
            <Link
              key={phase}
              href={`/?sky=${phase}`}
              aria-current={skyPreview === phase ? "page" : undefined}
            >
              {phase}
            </Link>
          ))}
          <Link href="/">Live time</Link>
        </nav>
      )}
      <CustomerHeader account={account} showAccount morphOnScroll />
      <main id="customer-content">
        <section
          id="create"
          className={`sky-hero-section${createOnly ? " sky-hero-create-only" : ""}`}
        >
          <div ref={heroContent} className="sky-hero-container">
            <h1 className="sky-hero-title">
              From what if
              <br />
              <span className="sky-hero-serif">to there it is.</span>
            </h1>

            <p className="sky-hero-subtitle">
              <span className="subtitle-desktop">
                Uncensored AI is coming to Runly.
                <br />A ready-to-use workspace. Built-in project previews.
              </span>
              <span className="subtitle-mobile">
                Uncensored AI is coming.
                <br />
                Your workspace, ready to create.
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
                maxLength={12_000}
                disabled={startingProject}
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
                  <Image
                    src="/figma/landing/attach.svg"
                    width={20}
                    height={20}
                    alt=""
                    aria-hidden="true"
                  />
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
                  disabled={
                    (!prompt.trim() && !attachments.length) || startingProject
                  }
                  aria-busy={startingProject}
                  aria-label="Start building"
                >
                  <Image
                    src="/figma/landing/up.svg"
                    width={20}
                    height={20}
                    alt=""
                    aria-hidden="true"
                  />
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
            <nav className="sky-suggestions" aria-label="Start with an idea">
              {suggestions.map(({ href, icon, label }) => (
                <Link className="sky-suggestion-link" href={href} key={href}>
                  <Image
                    src={icon}
                    width={24}
                    height={24}
                    alt=""
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </Link>
              ))}
            </nav>

            <p className="sky-hero-footnote">
              One workspace. Every kind of idea.
            </p>
          </div>
        </section>
        {!createOnly && (
          <>
            <LandingShowcase revealReady={heroExited} />

            <section className="features-section" id="explore">
              <LandingMotion className="features-container" variant="features">
                <div className="features-left">
                  <h2 className="features-title">
                    Big ideas.
                    <br />
                    <span>No blank-page feeling.</span>
                  </h2>
                  <p className="features-subtitle">
                    Build in one workspace. More model freedom is coming.
                  </p>
                  <div className="features-list">
                    <div className="feature-item">
                      <Image
                        src="/figma/landing/video.svg"
                        width={24}
                        height={24}
                        alt=""
                        aria-hidden="true"
                      />
                      <div className="feature-text">
                        <h3>Uncensored models, coming soon.</h3>
                        <p>Open models designed for fewer restrictions.</p>
                      </div>
                    </div>
                    <div className="feature-item">
                      <Image
                        src="/figma/landing/globe.svg"
                        width={24}
                        height={24}
                        alt=""
                        aria-hidden="true"
                      />
                      <div className="feature-text">
                        <h3>A workspace, ready to build.</h3>
                        <p>
                          Start from a template or an empty project. No local
                          setup.
                        </p>
                      </div>
                    </div>
                    <div className="feature-item">
                      <Image
                        src="/figma/landing/app.svg"
                        width={24}
                        height={24}
                        alt=""
                        aria-hidden="true"
                      />
                      <div className="feature-text">
                        <h3>Your code, your repository.</h3>
                        <p>
                          Keep projects in Runly. GitHub connection requires
                          setup.
                        </p>
                      </div>
                    </div>
                  </div>
                  <Link className="text-link" href="/create#create">
                    Start with your idea
                    <Image
                      src="/figma/landing/up-small.svg"
                      width={18}
                      height={18}
                      alt=""
                      aria-hidden="true"
                    />
                  </Link>
                </div>
                <figure className="features-right">
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
                  <figcaption className="sky-card-caption">
                    <span className="sky-card-quote">
                      “Make this feel like a weekend away.”
                    </span>
                    <span className="sky-card-sub">
                      A visual direction for your next project.
                    </span>
                  </figcaption>
                </figure>
              </LandingMotion>
            </section>

            <section className="creation-section" id="how-it-works">
              <LandingMotion className="creation-container" variant="steps">
                <p className="section-eyebrow">A simple way to begin</p>
                <h2 className="creation-title">
                  A thought. A conversation. A creation.
                </h2>
                <div className="creation-grid">
                  <div className="creation-col">
                    <span className="creation-num">01</span>
                    <h3 className="creation-heading">Bring the idea</h3>
                    <p className="creation-desc">
                      Describe your idea, choose a template, or start with an
                      empty project.
                    </p>
                  </div>
                  <div className="creation-col">
                    <span className="creation-num">02</span>
                    <h3 className="creation-heading">Make it yours</h3>
                    <p className="creation-desc">
                      Give feedback in plain language. See the result take shape
                      beside your chat.
                    </p>
                  </div>
                  <div className="creation-col">
                    <span className="creation-num">03</span>
                    <h3 className="creation-heading">
                      Review and keep refining
                    </h3>
                    <p className="creation-desc">
                      Review what you have so far and decide what to change
                      next.
                    </p>
                  </div>
                </div>
                <Link className="text-link creation-link" href="/support">
                  Need a hand? Get support
                  <Image
                    src="/figma/landing/up-small.svg"
                    width={18}
                    height={18}
                    alt=""
                    aria-hidden="true"
                  />
                </Link>
              </LandingMotion>
            </section>
          </>
        )}
        {!createOnly && (
          <section className="landing-closing">
            <LandingMotion className="landing-closing-layout" variant="closing">
              <div>
                <p className="section-eyebrow">Have something in mind?</p>
                <h2>Your next idea starts here.</h2>
              </div>
              <Link className="text-link" href="/create#create">
                Start creating
                <Image
                  src="/figma/landing/up-small.svg"
                  width={18}
                  height={18}
                  alt=""
                  aria-hidden="true"
                />
              </Link>
            </LandingMotion>
          </section>
        )}
      </main>
      <CustomerFooter />
    </div>
  );
}
