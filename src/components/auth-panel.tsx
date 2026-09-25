"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-provider";

export function AuthPanel({
  mode,
  initialEmail = "",
  initialTokenHash = "",
}: {
  mode: "login" | "signup" | "verify" | "forgot" | "reset";
  initialEmail?: string;
  initialTokenHash?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const verificationEmail = useSyncExternalStore(
    () => () => {},
    () =>
      initialEmail ||
      window.sessionStorage.getItem("runly-verification-email") ||
      "",
    () => initialEmail,
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const sending = useRef(false);
  const codeInputs = useRef<Array<HTMLInputElement | null>>([]);
  const [verificationCode, setVerificationCode] = useState("");
  const title = {
    login: "Welcome back.",
    signup: "Make room for your next idea.",
    verify: "Check your email.",
    forgot: "Reset your password.",
    reset: "Choose a new password.",
  }[mode];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const invalid: Record<string, string> = {};
    if (
      mode !== "reset" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(fields.get("email") || ""))
    )
      invalid.email = "Enter a valid email address.";
    if (
      ["login", "signup", "reset"].includes(mode) &&
      String(fields.get("password") || "").length < 8
    )
      invalid.password = "Use at least 8 characters.";
    if (
      mode === "verify" &&
      !initialTokenHash &&
      !/^\d{6}$/.test(String(fields.get("code") || ""))
    )
      invalid.code = "Enter the six-digit code from your email.";
    if (mode === "signup" && !accepted)
      invalid.accepted =
        "Accept the Terms and acknowledge the Privacy Policy to continue.";
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      (
        event.currentTarget.elements.namedItem(
          Object.keys(invalid)[0],
        ) as HTMLElement
      )?.focus();
      return;
    }
    await run(mode, {
      email: fields.get("email"),
      token_hash: initialTokenHash,
      password: fields.get("password"),
      code: fields.get("code"),
      accepted,
    });
  }
  async function run(action: string, payload: Record<string, unknown>) {
    if (sending.current) return;
    sending.current = true;
    setPending(true);
    setMessage("");
    setFailed(false);
    try {
      const response = await fetch(`/api/auth/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Please try again.");
      setMessage(result.message || "Redirecting…");
      if (result.url) window.location.assign(result.url);
      else if (result.redirect) {
        if (mode === "signup") {
          window.sessionStorage.setItem(
            "runly-verification-email",
            String(payload.email || ""),
          );
        }
        router.replace(result.redirect);
        router.refresh();
      }
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Connection interrupted. Please try again.",
      );
    } finally {
      sending.current = false;
      setPending(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-brand">
        <Brand />
        <ThemeToggle />
      </div>
      <section className="auth-panel">
        <h1>{title}</h1>
        <p>
          {mode === "signup"
            ? "Your ideas, with a place to begin. We’ll verify your email before creating your workspace."
            : mode === "verify"
              ? "Enter the six-digit code we emailed you to finish creating your account."
              : mode === "forgot"
                ? "We’ll send a secure reset link to your email."
                : "Continue to your Runly workspace."}
        </p>
        <form onSubmit={submit} noValidate aria-busy={pending}>
          {mode !== "reset" &&
            (mode === "verify" ? (
              <div className="auth-email-display">
                <span>Email</span>
                <strong>
                  {verificationEmail || "Email verification link"}
                </strong>
                <input type="hidden" name="email" value={verificationEmail} />
              </div>
            ) : (
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  disabled={pending}
                  onChange={() => setErrors((old) => ({ ...old, email: "" }))}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                />
                {errors.email && (
                  <span className="field-error" id="email-error">
                    {errors.email}
                  </span>
                )}
              </label>
            ))}
          {mode === "verify" && (
            <label>
              Six-digit code
              <input type="hidden" name="code" value={verificationCode} />
              <div
                className="auth-code-slots"
                role="group"
                aria-label="Six-digit verification code"
              >
                {Array.from({ length: 6 }, (_, index) => (
                  <input
                    key={index}
                    ref={(element) => {
                      codeInputs.current[index] = element;
                    }}
                    className="auth-code-slot"
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    value={verificationCode[index] || ""}
                    disabled={pending}
                    aria-label={`Digit ${index + 1}`}
                    onChange={(event) => {
                      const digit = event.target.value
                        .replace(/\D/g, "")
                        .slice(-1);
                      if (!digit) return;
                      const next =
                        `${verificationCode.slice(0, index)}${digit}${verificationCode.slice(index + 1)}`.slice(
                          0,
                          6,
                        );
                      setVerificationCode(next);
                      setErrors((old) => ({ ...old, code: "" }));
                      codeInputs.current[Math.min(index + 1, 5)]?.focus();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Backspace" || event.key === "Delete") {
                        event.preventDefault();
                        if (verificationCode[index]) {
                          setVerificationCode(
                            `${verificationCode.slice(0, index)}${verificationCode.slice(index + 1)}`,
                          );
                        } else if (event.key === "Backspace" && index > 0) {
                          codeInputs.current[index - 1]?.focus();
                        }
                      }
                    }}
                    onPaste={(event) => {
                      event.preventDefault();
                      const pasted = event.clipboardData
                        .getData("text")
                        .replace(/\D/g, "")
                        .slice(0, 6);
                      setVerificationCode(pasted);
                      codeInputs.current[Math.min(pasted.length, 5)]?.focus();
                    }}
                  />
                ))}
              </div>
              {errors.code && (
                <span className="field-error" id="code-error">
                  {errors.code}
                </span>
              )}
            </label>
          )}
          {["login", "signup", "reset"].includes(mode) && (
            <div className="auth-password">
              <label htmlFor="account-password">Password</label>
              <div className="password-control">
                <input
                  id="account-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  required
                  minLength={8}
                  maxLength={128}
                  disabled={pending}
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? "password-error" : undefined
                  }
                  onChange={() =>
                    setErrors((old) => ({ ...old, password: "" }))
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {errors.password && (
                <span className="field-error" id="password-error">
                  {errors.password}
                </span>
              )}
            </div>
          )}
          {mode === "signup" && (
            <>
              <label className="consent">
                <input
                  name="accepted"
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => {
                    setAccepted(e.target.checked);
                    setErrors((old) => ({ ...old, accepted: "" }));
                  }}
                  required
                  disabled={pending}
                  aria-invalid={!!errors.accepted}
                  aria-describedby={
                    errors.accepted ? "consent-error" : undefined
                  }
                />
                <span>
                  I accept the <Link href="/terms">Terms</Link> and acknowledge
                  the <Link href="/privacy">Privacy Policy</Link>.
                </span>
              </label>
              {errors.accepted && (
                <span className="field-error" id="consent-error">
                  {errors.accepted}
                </span>
              )}
            </>
          )}
          <button
            className="button button-dark busy-button"
            disabled={pending}
            aria-busy={pending}
          >
            <span className={pending ? "busy-label" : ""}>
              {
                {
                  login: "Sign in",
                  signup: "Create account",
                  verify: "Verify email",
                  forgot: "Send reset link",
                  reset: "Update password",
                }[mode]
              }
            </span>
            {pending && (
              <span className="button-spinner" aria-label="Processing" />
            )}
          </button>
        </form>
        {mode === "verify" && (
          <button
            className="auth-resend"
            type="button"
            disabled={pending || !verificationEmail}
            onClick={() => run("resend", { email: verificationEmail })}
          >
            Send a new code
          </button>
        )}
        {(mode === "login" || mode === "signup") && (
          <>
            <button
              className="button button-outline"
              disabled
              aria-describedby="github-unavailable"
            >
              Continue with GitHub
            </button>
            <p id="github-unavailable" className="auth-provider-note">
              GitHub sign-in is not enabled yet. Use email and password.
            </p>
          </>
        )}
        <div className="auth-feedback" aria-live="polite">
          {message && (
            <p className="inline-notice" role={failed ? "alert" : "status"}>
              {message}
            </p>
          )}
        </div>
        <p className="auth-switch">
          {mode === "login" ? (
            <>
              <Link href="/forgot-password">Forgot password?</Link> ·{" "}
              <Link href="/signup">Create an account</Link>
            </>
          ) : (
            <Link href="/login">Back to sign in</Link>
          )}
        </p>
      </section>
      <aside className="auth-aside auth-illustrated">
        <div className="auth-cat">
          <Image
            src="/cats/sitting.png"
            alt="A grainy black kitten with golden eyes"
            width={1254}
            height={1254}
            sizes="(max-width: 900px) 0px, 45vw"
            priority
          />
        </div>
        <blockquote>
          Your next chapter
          <br />
          starts with an idea.
        </blockquote>
        <Brand />
      </aside>
    </main>
  );
}
