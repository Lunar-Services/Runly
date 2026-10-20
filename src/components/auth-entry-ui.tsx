"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import styles from "./auth-entry-ui.module.css";

type AuthEntryUIProps = {
  mode: "login" | "signup";
  next?: string;
};

function localDestination(next?: string) {
  return next && next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/workspace/new";
}

export function AuthEntryUI({ mode, next }: AuthEntryUIProps) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  const destination = localDestination(next);
  const passwordHref = safeNext
    ? `/${mode}?method=password&next=${encodeURIComponent(safeNext)}`
    : `/${mode}?method=password`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    setPending(true);
    setNotice("");
    setFailed(false);
    try {
      const response = await fetch("/api/auth/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") || ""),
          signup: isSignup,
          accepted: form.get("accepted") === "on",
          fullName: String(form.get("name") || "").trim(),
          next: destination,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Please try again.");
      if (result.redirect) {
        window.sessionStorage.setItem(
          "runly-verification-email",
          String(form.get("email") || ""),
        );
        router.replace(result.redirect);
        router.refresh();
      } else setNotice(result.message || "Check your email to continue.");
    } catch (error) {
      setFailed(true);
      setNotice(
        error instanceof Error
          ? error.message
          : "Connection interrupted. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }
  async function continueWithGithub() {
    if (pending) return;
    if (isSignup && !legalAccepted) {
      setFailed(true);
      setNotice("Accept the Terms and acknowledge the Privacy Policy first.");
      return;
    }
    setPending(true);
    setNotice("");
    setFailed(false);
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signup: isSignup,
          accepted: legalAccepted,
          next: destination,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Please try again.");
      if (!result.url) throw new Error("GitHub sign-in is unavailable.");
      window.location.assign(result.url);
    } catch (error) {
      setFailed(true);
      setNotice(
        error instanceof Error ? error.message : "Please try again later.",
      );
      setPending(false);
    }
  }

  return (
    <main className={styles.page}>
      <section
        aria-labelledby="auth-entry-title"
        className={`${styles.card} ${isSignup ? styles.signup : styles.login}`}
      >
        <Link
          className={styles.close}
          href="/"
          aria-label={isSignup ? "Close account creation" : "Close sign-in"}
        >
          <X size={20} strokeWidth={1.8} aria-hidden="true" />
        </Link>

        <div className={styles.mark} aria-hidden="true">
          <Image
            src="/brand/figma/runly-mark.png"
            alt=""
            width={42}
            height={42}
            priority
          />
        </div>

        <header className={styles.heading}>
          <h1 id="auth-entry-title">
            {isSignup ? "Make room for your ideas." : "Welcome back."}
          </h1>
          <p>
            {isSignup
              ? "Create your Runly account to get started."
              : "Your next great idea is waiting."}
          </p>
        </header>

        <button
          className={styles.googleButton}
          type="button"
          onClick={() => void continueWithGithub()}
          disabled={pending}
        >
          Continue with Google
        </button>

        <div className={styles.divider} aria-label="or continue with email">
          <span aria-hidden="true" />
          <p>or continue with email</p>
          <span aria-hidden="true" />
        </div>

        <form
          className={styles.form}
          onSubmit={submit}
          onChange={(event) => {
            setNotice("");
            const target = event.target;
            if (
              target instanceof HTMLInputElement &&
              target.name === "accepted"
            )
              setLegalAccepted(target.checked);
          }}
          aria-busy={pending}
        >
          {isSignup && (
            <label className={styles.field}>
              <span>Full name</span>
              <input
                autoComplete="name"
                name="name"
                placeholder="Your name"
                required
              />
            </label>
          )}
          <label className={styles.field}>
            <span>Email address</span>
            <input
              autoComplete="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              required
            />
          </label>

          {!isSignup && (
            <p className={styles.emailHint}>
              We’ll send you a secure sign-in code.
            </p>
          )}

          {isSignup && (
            <p className={styles.terms}>
              <label>
                <input type="checkbox" name="accepted" required /> I agree to
                the terms below. <br />
              </label>
              By continuing, you agree to our{" "}
              <Link href="/terms">Terms of Service</Link> and{" "}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>
          )}

          <button className={styles.submit} type="submit">
            {pending
              ? "Please wait…"
              : isSignup
                ? "Create account"
                : "Continue with email"}
          </button>
        </form>

        {notice && (
          <div
            className={styles.confirmation}
            role={failed ? "alert" : "status"}
          >
            <p>{notice}</p>
            {!failed && (
              <Link href="/verify-email">Continue to email verification</Link>
            )}
          </div>
        )}

        <p className={styles.switchMode}>
          {isSignup ? (
            <>
              Already have an account? <Link href="/login">Log in</Link>
            </>
          ) : (
            <>
              New to Runly? <Link href="/signup">Create an account</Link>
            </>
          )}
        </p>
        <Link className={styles.passwordFallback} href={passwordHref}>
          Use a password instead
        </Link>
      </section>
    </main>
  );
}
