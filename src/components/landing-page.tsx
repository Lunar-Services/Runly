"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "./theme-provider";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowUp,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Brand } from "./brand";
import { BusinessMotion, PlanComparison } from "./business-motion";

const suggestions = [
  "A personal website",
  "A client portal",
  "A small online shop",
];

export function LandingPage({
  account,
}: {
  account: { email: string; displayName: string; avatarUrl: string } | null;
}) {
  const [prompt, setPrompt] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [startingProject, setStartingProject] = useState(false);
  const { darkTheme, toggleTheme } = useTheme();
  const router = useRouter();
  const watcher = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () =>
      header.current?.classList.toggle("is-scrolled", window.scrollY > 16);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    const element = watcher.current;
    if (
      !element ||
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !matchMedia("(pointer: fine)").matches
    )
      return;
    let frame = 0;
    let lastTime = 0;
    let targetX = 0,
      targetY = 0,
      currentX = 0,
      currentY = 0;
    const track = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      targetX = Math.max(
        -1,
        Math.min(
          1,
          (event.clientX - bounds.left - bounds.width * 0.42) /
            Math.max(bounds.width, 240),
        ),
      );
      targetY = Math.max(
        -1,
        Math.min(
          1,
          (event.clientY - bounds.top - bounds.height * 0.5) /
            Math.max(bounds.height, 240),
        ),
      );
      start();
    };
    const reset = () => {
      targetX = 0;
      targetY = 0;
      start();
    };
    const animate = (time: number) => {
      const dt = lastTime ? Math.min(time - lastTime, 50) : 16;
      lastTime = time;
      const easing = 1 - Math.exp(-dt / 140);
      currentX += (targetX - currentX) * easing;
      currentY += (targetY - currentY) * easing;
      // Percent-based travel remains inside the eye rings at every viewport size.
      element.style.setProperty("--look-x", `${currentX * 70}%`);
      element.style.setProperty("--look-y", `${currentY * 55}%`);
      if (Math.abs(targetX - currentX) + Math.abs(targetY - currentY) > 0.001)
        frame = requestAnimationFrame(animate);
      else {
        frame = 0;
        lastTime = 0;
      }
    };
    function start() {
      if (!frame) frame = requestAnimationFrame(animate);
    }
    window.addEventListener("pointermove", track, { passive: true });
    document.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    window.addEventListener("scroll", reset, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", track);
      document.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
      window.removeEventListener("scroll", reset);
    };
  }, []);

  async function startBuilding() {
    if (!prompt.trim()) return;
    const firstMessage = prompt.trim();
    if (account) {
      setStartingProject(true);
      setMessage("");
      try {
        const response = await fetch("/api/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: firstMessage }),
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
      sessionStorage.setItem("runly:draft-prompt", firstMessage);
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
    <div className={`marketing-shell cat-site${darkTheme ? " is-dark" : ""}`}>
      <header className="site-header" ref={header}>
        <Brand />
        <nav
          id="main-navigation"
          className={menuOpen ? "nav-links is-open" : "nav-links"}
          aria-label="Main navigation"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setMenuOpen(false);
              document.getElementById("navigation-toggle")?.focus();
            }
          }}
        >
          <div className="nav-primary">
            <a href="#product" onClick={() => setMenuOpen(false)}>
              Meet Runly
            </a>
            <a href="#cowork" onClick={() => setMenuOpen(false)}>
              For teams
            </a>
            <a href="#pricing" onClick={() => setMenuOpen(false)}>
              Pricing
            </a>
          </div>
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
                      <LayoutDashboard size={16} />
                      Dashboard
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={signOut}
                      disabled={signingOut}
                    >
                      <LogOut size={16} />
                      {signingOut ? "Logging out…" : "Logout"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/login">Log in</Link>
                <Link className="button button-dark nav-cta" href="/signup">
                  Get started
                </Link>
              </>
            )}
            <button
              className="theme-toggle"
              type="button"
              onClick={toggleTheme}
              aria-pressed={darkTheme}
              aria-label={darkTheme ? "Use light theme" : "Use dark theme"}
              title={darkTheme ? "Use light theme" : "Use dark theme"}
            >
              {darkTheme ? <Sun size={17} /> : <Moon size={17} />}
            </button>
          </div>
        </nav>
        <button
          id="navigation-toggle"
          className="menu-button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-controls="main-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </header>

      <main>
        <section className="cat-hero">
          <div className="cat-hero-copy">
            <h1>
              A little idea.
              <br />A place to
              <br />
              make it real.
            </h1>
            <p>Tell Runly what you want to build.</p>
            <form
              className="cat-composer"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                startBuilding();
              }}
            >
              <label htmlFor="hero-prompt" className="cat-sr-only">
                What would you like to build?
              </label>
              <textarea
                className="resize-none"
                id="hero-prompt"
                rows={3}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="A website, a tool, something you've been thinking about…"
              />
              <div className="cat-composer-actions">
                <div className="cat-suggestions">
                  {suggestions.map((text) => (
                    <button
                      type="button"
                      key={text}
                      onClick={() => setPrompt(text)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                <button
                  className="cat-send"
                  type="submit"
                  disabled={!prompt.trim() || startingProject}
                  aria-busy={startingProject}
                  aria-label="Start building"
                >
                  <ArrowUp size={19} />
                </button>
              </div>
            </form>
            {message && (
              <p role="alert" className="cat-error">
                {message}
              </p>
            )}
          </div>
          <div className="cat-hero-art">
            <Image
              className="cat-standing"
              src="/cats/standing.png"
              alt="A curious hand-drawn black cat with white eyes"
              width={1280}
              height={1280}
              sizes="(max-width: 800px) 85vw, 40vw"
              priority
            />
          </div>
        </section>

        <section id="product" className="cat-meet">
          <h2>
            Meet your curious
            <br />
            little collaborator.
          </h2>
          <p>
            A space to work through an idea, try a change,
            <br className="cat-desktop-break" /> and see where it takes you.
          </p>
          <div className="cat-watcher" ref={watcher}>
            <Image
              className="cat-sitting"
              src="/cats/sitting.png"
              alt="A seated black kitten with golden eyes following your pointer"
              width={1280}
              height={1280}
              sizes="(max-width: 800px) 90vw, 520px"
            />
            <span
              aria-hidden="true"
              className="cat-eye-glint cat-eye-glint-left"
            />
            <span
              aria-hidden="true"
              className="cat-eye-glint cat-eye-glint-right"
            />
          </div>
          <div className="cat-notes">
            <article>
              <h3>Start with a thought.</h3>
              <p>A rough sentence is enough. Add the details as you go.</p>
            </article>
            <article>
              <h3>Make it your own.</h3>
              <p>Keep the conversation and your project in the same place.</p>
            </article>
            <article>
              <h3>Take another look.</h3>
              <p>Review the work, change your mind, and keep going.</p>
            </article>
          </div>
        </section>

        <section id="cowork" className="cat-team">
          <div>
            <span className="cat-label">Runly Cowork</span>
            <h2>
              A little company
              <br />
              for your next idea.
            </h2>
            <p>Bring the people you build with into one shared workspace.</p>
            <Link className="cat-text-link" href="/cowork">
              Explore Cowork <span aria-hidden="true">↗</span>
            </Link>
          </div>
          <Image
            className="cat-sleeping"
            src="/cats/sleeping.png"
            alt="A black cat curled up asleep"
            width={1280}
            height={1280}
            sizes="(max-width: 800px) 90vw, 500px"
          />
        </section>

        <section id="pricing" className="cat-pricing">
          <div className="cat-pricing-head">
            <h2>A plan for your pace.</h2>
            <p>Start on your own. Bring a team when you’re ready.</p>
          </div>
          <PlanComparison />
          <div className="cat-plans">
            {[
              [
                "Standard",
                "$3",
                "For personal projects",
                "100k tokens / 3 hours",
              ],
              ["Pro", "$9", "For your everyday work", "350k tokens / 3 hours"],
              [
                "Cowork",
                "$19",
                "For up to five people",
                "1m shared tokens / 3 hours",
              ],
            ].map(([name, price, note, allowance]) => (
              <article key={name}>
                <h3>{name}</h3>
                <p>{note}</p>
                <div className="cat-price">
                  {price}
                  <span>/ month</span>
                </div>
                <p className="cat-allowance">{allowance}</p>
                <Link className="button button-outline" href="/signup">
                  Choose {name}
                </Link>
              </article>
            ))}
          </div>
        </section>

        <BusinessMotion />
        <section className="cat-close">
          <h2>What are you thinking?</h2>
          <a className="button button-dark" href="#hero-prompt">
            Let’s start
          </a>
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
