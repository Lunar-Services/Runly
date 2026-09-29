"use client";

import { useEffect, useRef, useState } from "react";
import { ThemeToggle, useTheme } from "./theme-provider";
import Link from "next/link";
import {
  ArrowUp,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Brand } from "./brand";
import { BusinessMotion, PlanComparison } from "./business-motion";
import { SubscriptionComparison } from "./subscription-comparison";
import { CodeCard } from "./code-card";
import art from "./landing-art.module.css";
import { CatAnimation } from "./cat-animation";
import { TextRotation } from "./text-rotation";
import { GetStartedButton } from "./get-started-button";

const suggestions = [
  "A personal website",
  "A client portal",
  "A small online shop",
];

export function LandingPage({
  account,
  initialPlan,
  initialMonths,
}: {
  account: { email: string; displayName: string; avatarUrl: string } | null;
  initialPlan?: string;
  initialMonths?: number;
}) {
  const [prompt, setPrompt] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [startingProject, setStartingProject] = useState(false);
  const { darkTheme } = useTheme();
  const router = useRouter();
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () =>
      header.current?.classList.toggle("is-scrolled", window.scrollY > 16);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
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
      <a className="cat-skip-link" href="#main-content">
        Skip to content
      </a>
      <header
        className="site-header"
        ref={header}
        style={{
          backdropFilter: "var(--marketing-header-blur)",
          WebkitBackdropFilter: "var(--marketing-header-blur)",
        }}
      >
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
                  <ChevronDown size={19} aria-hidden="true" />
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
                      <LayoutDashboard size={20} />
                      Dashboard
                    </Link>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={signOut}
                      disabled={signingOut}
                    >
                      <LogOut size={20} />
                      {signingOut ? "Logging out…" : "Logout"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/login">Log in</Link>
                <GetStartedButton />
              </>
            )}
            <ThemeToggle />
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

      <main id="main-content">
        <section className="cat-hero">
          <div className="cat-hero-copy">
            <TextRotation />
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
                  <ArrowUp size={24} />
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
            <CatAnimation
              name="hero-loop"
              label="A curious black cat looking around"
              width={1250}
              height={1250}
              hero
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
          <div className="cat-watcher cat-watcher-video">
            <CatAnimation
              name="curious-loop"
              label="A little black cat turning its head curiously"
              width={1500}
              height={844}
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
          <div className={art.workbench}>
            <div className={art.workbenchCopy}>
              <h3>See the idea take shape.</h3>
              <p>
                Start with a sentence, inspect the work, then change what needs
                changing.
              </p>
              <CodeCard />
            </div>
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
          <div className="cat-team-animation">
            <CatAnimation
              name="hero-loop"
              label="A black cat keeping you company"
              width={1250}
              height={1250}
            />
          </div>
        </section>

        <section id="pricing" className={`cat-pricing ${art.pricing}`}>
          <div className="cat-pricing-head">
            <h2>A plan for your pace.</h2>
            <p>Start on your own. Bring a team when you’re ready.</p>
          </div>
          <PlanComparison
            initialPlan={initialPlan}
            initialMonths={initialMonths}
          />
          <SubscriptionComparison />
        </section>

        <BusinessMotion />
        <section className={`cat-close ${art.close}`}>
          <div className={art.closingArtwork} aria-hidden="true" />
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
