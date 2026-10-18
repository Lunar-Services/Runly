"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
} from "lucide-react";
import { AccountShell } from "./account-shell";
import styles from "./account-security.module.css";

type SecurityFactor = {
  id: string;
  type: "totp";
  status: "verified" | "unverified";
  friendlyName: string;
  createdAt: string;
};

type SecurityState = {
  email: string;
  providers: string[];
  factors: SecurityFactor[];
  lastSignInAt: string | null;
};

type Enrollment = { factorId: string; qrCode: string; secret: string };

function providerName(provider: string) {
  const names: Record<string, string> = {
    email: "Email",
    github: "GitHub",
    google: "Google",
    apple: "Apple",
    azure: "Microsoft",
  };
  return names[provider] ?? provider.replace(/[_-]/g, " ");
}

function formatDate(value: string | null) {
  if (!value) return "Active now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Active now";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function AccountSecurity({
  passwordOnly = false,
}: { passwordOnly?: boolean } = {}) {
  const [state, setState] = useState<SecurityState | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [setupKeySaved, setSetupKeySaved] = useState(false);
  const [pendingFactorId, setPendingFactorId] = useState("");
  const [disableFactorId, setDisableFactorId] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [confirmSignOutOthers, setConfirmSignOutOthers] = useState(false);
  const [signOutPending, setSignOutPending] = useState(false);

  const loadSecurity = useCallback(async () => {
    try {
      const response = await fetch("/api/account/security", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      const loaded = result as SecurityState;
      setState(loaded);
      setPendingFactorId(
        loaded.factors.find((factor) => factor.status === "unverified")?.id ??
          "",
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't load your security settings.",
      );
      setNoticeIsError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadSecurity(), 0);
    return () => window.clearTimeout(timer);
  }, [loadSecurity]);

  async function updatePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setNoticeIsError(false);
    if (password.length < 8 || password.length > 128) {
      setNotice("Use a password between 8 and 128 characters.");
      setNoticeIsError(true);
      return;
    }
    if (password !== confirmPassword) {
      setNotice("The passwords don't match.");
      setNoticeIsError(true);
      return;
    }

    setPending(true);
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setPassword("");
      setConfirmPassword("");
      setNotice(result.message || "Password updated.");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't update your password.",
      );
      setNoticeIsError(true);
    } finally {
      setPending(false);
    }
  }

  async function beginAuthenticatorSetup() {
    setPending(true);
    setNotice("");
    setNoticeIsError(false);
    try {
      const response = await fetch("/api/account/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enroll" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setEnrollment({
        factorId: result.factor.id,
        qrCode: result.totp.qr_code,
        secret: result.totp.secret,
      });
      setEnrollmentCode("");
      setSetupKeySaved(false);
      setPendingFactorId(result.factor.id);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't start authenticator setup.",
      );
      setNoticeIsError(true);
    } finally {
      setPending(false);
    }
  }

  async function verifyAuthenticator(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enrollment || !/^\d{6}$/.test(enrollmentCode)) return;
    setPending(true);
    setNotice("");
    setNoticeIsError(false);
    try {
      const response = await fetch("/api/account/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          factorId: enrollment.factorId,
          code: enrollmentCode,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setEnrollment(null);
      setEnrollmentCode("");
      setSetupKeySaved(false);
      setPendingFactorId("");
      setNotice(result.message);
      await loadSecurity();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "That code couldn't be verified. Check it and try again.",
      );
      setNoticeIsError(true);
    } finally {
      setPending(false);
    }
  }

  async function removeAuthenticator(factorId: string, code = "") {
    setPending(true);
    setNotice("");
    setNoticeIsError(false);
    try {
      const response = await fetch("/api/account/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", factorId, code }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setEnrollment(null);
      setEnrollmentCode("");
      setSetupKeySaved(false);
      setDisableFactorId("");
      setDisableCode("");
      setPendingFactorId("");
      setNotice(result.message);
      await loadSecurity();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't remove the authenticator.",
      );
      setNoticeIsError(true);
    } finally {
      setPending(false);
    }
  }

  async function signOutOtherSessions() {
    setSignOutPending(true);
    setNotice("");
    setNoticeIsError(false);
    try {
      const response = await fetch("/api/account/security/sessions", {
        method: "POST",
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      setNotice(result.message);
      setConfirmSignOutOthers(false);
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't sign out your other sessions.",
      );
      setNoticeIsError(true);
    } finally {
      setSignOutPending(false);
    }
  }

  const verifiedFactors =
    state?.factors.filter((factor) => factor.status === "verified") ?? [];
  const hasPendingFactor = Boolean(pendingFactorId);
  const qrImage = enrollment
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qrCode)}`
    : "";

  return (
    <AccountShell
      title={passwordOnly ? "Email password" : "Security"}
      description={
        passwordOnly
          ? "Set or change the password for your email sign-in."
          : "Stay in control of how you access your account."
      }
    >
      {notice && (
        <p
          className="account-notice"
          role={noticeIsError ? "alert" : "status"}
          aria-live={noticeIsError ? "assertive" : "polite"}
        >
          {notice}
        </p>
      )}

      <section className="account-section" aria-labelledby="sign-in-heading">
        <div className="account-section-heading">
          <div className={styles.sectionIcon} aria-hidden="true">
            <KeyRound size={18} />
          </div>
          <div>
            <h2 id="sign-in-heading">Sign-in methods</h2>
            <p>Manage the ways you can access Runly.</p>
          </div>
        </div>
        <div className="account-row">
          <div className="account-row-copy">
            <strong>Email</strong>
            <span>
              {state?.email || (loading ? "Loading…" : "Email unavailable")}
            </span>
          </div>
          <span className={styles.methodBadge}>
            <Check size={14} aria-hidden="true" />
            Verified
          </span>
        </div>
        {(state?.providers ?? [])
          .filter((provider) => provider !== "email")
          .map((provider) => (
            <div className="account-row" key={provider}>
              <div className="account-row-copy">
                <strong>{providerName(provider)}</strong>
                <span>Connected sign-in method</span>
              </div>
              <span className={styles.methodBadge}>
                <Check size={14} aria-hidden="true" />
                Connected
              </span>
            </div>
          ))}
        {passwordOnly ? (
          <div className={`account-row ${styles.passwordRow}`}>
            <div className="account-row-copy">
              <strong>Email password</strong>
              <span>Set or change the password for your email sign-in.</span>
            </div>
            <form className={styles.passwordForm} onSubmit={updatePassword}>
              <label
                className="account-field-label"
                htmlFor="security-new-password"
              >
                New password
              </label>
              <div className={styles.passwordControl}>
                <input
                  className="account-input"
                  id="security-new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  disabled={pending}
                  required
                />
                <button
                  type="button"
                  className={styles.revealButton}
                  aria-label={
                    showPassword ? "Hide new password" : "Show new password"
                  }
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <label
                className="account-field-label"
                htmlFor="security-confirm-password"
              >
                Confirm new password
              </label>
              <div className={styles.passwordControl}>
                <input
                  className="account-input"
                  id="security-confirm-password"
                  type={showConfirmation ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  disabled={pending}
                  required
                />
                <button
                  type="button"
                  className={styles.revealButton}
                  aria-label={
                    showConfirmation ? "Hide confirmation" : "Show confirmation"
                  }
                  aria-pressed={showConfirmation}
                  onClick={() => setShowConfirmation((visible) => !visible)}
                >
                  {showConfirmation ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              <button
                className="account-button"
                type="submit"
                disabled={pending || password.length < 8 || !confirmPassword}
              >
                {pending ? "Saving…" : "Save password"}
              </button>
            </form>
          </div>
        ) : (
          <div className="account-row">
            <div className="account-row-copy">
              <strong>Email password</strong>
              <span>Set or change the password for your email sign-in.</span>
            </div>
            <Link
              className="account-button-secondary"
              href="/settings/security/password"
            >
              Manage email password
            </Link>
          </div>
        )}
      </section>

      {passwordOnly && (
        <Link className="account-text-link" href="/settings/security">
          Back to security
        </Link>
      )}
      {!passwordOnly && (
        <>
          <section
            className="account-section"
            aria-labelledby="two-step-heading"
          >
            <div className="account-section-heading">
              <div className={styles.sectionIcon} aria-hidden="true">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 id="two-step-heading">Two-step verification</h2>
                <p>
                  Add a second step with an authenticator app when you sign in.
                </p>
              </div>
            </div>
            {verifiedFactors.length > 0 ? (
              verifiedFactors.map((factor) => (
                <div className="account-row" key={factor.id}>
                  <div className="account-row-copy">
                    <strong>
                      {factor.friendlyName || "Authenticator app"}
                    </strong>
                    <span>Authenticator app is protecting your account.</span>
                  </div>
                  {disableFactorId === factor.id ? (
                    <form
                      className={styles.inlineVerify}
                      onSubmit={(event) => {
                        event.preventDefault();
                        void removeAuthenticator(factor.id, disableCode);
                      }}
                    >
                      <label
                        className="account-field-label"
                        htmlFor={`disable-code-${factor.id}`}
                      >
                        Authenticator code
                      </label>
                      <input
                        className="account-input"
                        id={`disable-code-${factor.id}`}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        value={disableCode}
                        onChange={(event) =>
                          setDisableCode(
                            event.target.value.replace(/\D/g, "").slice(0, 6),
                          )
                        }
                        required
                      />
                      <div className={styles.inlineActions}>
                        <button
                          className="account-button-secondary"
                          type="button"
                          onClick={() => {
                            setDisableFactorId("");
                            setDisableCode("");
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="account-button"
                          type="submit"
                          disabled={pending || disableCode.length !== 6}
                        >
                          {pending ? "Turning off…" : "Turn off"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      className="account-button-secondary"
                      type="button"
                      disabled={pending}
                      onClick={() => setDisableFactorId(factor.id)}
                    >
                      Turn off
                    </button>
                  )}
                </div>
              ))
            ) : hasPendingFactor && !enrollment ? (
              <div className="account-row">
                <div className="account-row-copy">
                  <strong>Setup in progress</strong>
                  <span>
                    The setup QR code is no longer available. Cancel setup and
                    start again to scan a fresh code.
                  </span>
                </div>
                <button
                  className="account-button-secondary"
                  type="button"
                  disabled={pending || !state}
                  onClick={() => {
                    const factor = state?.factors.find(
                      (item) => item.id === pendingFactorId,
                    );
                    if (factor) void removeAuthenticator(factor.id);
                  }}
                >
                  Cancel setup
                </button>
              </div>
            ) : !enrollment ? (
              <div className="account-row">
                <div className="account-row-copy">
                  <strong>
                    {loading ? "Checking status…" : "Authenticator app"}
                  </strong>
                  <span>
                    {loading
                      ? "Loading your verification settings."
                      : "Use a time-based code from an authenticator app."}
                  </span>
                </div>
                <button
                  className="account-button"
                  type="button"
                  disabled={pending || loading || !state}
                  onClick={() => void beginAuthenticatorSetup()}
                >
                  {pending ? "Starting…" : "Set up"}
                </button>
              </div>
            ) : null}

            {enrollment && (
              <div className={styles.enrollmentPanel}>
                <div>
                  <h3>Connect your authenticator</h3>
                  <p>
                    Scan this code in your authenticator app, then enter the
                    six-digit code it gives you.
                  </p>
                </div>
                <div className={styles.qrAndSecret}>
                  <Image
                    className={styles.qrCode}
                    src={qrImage}
                    alt="QR code for Runly authenticator setup"
                    width={192}
                    height={192}
                    unoptimized
                  />
                  <div className={styles.secretBlock}>
                    <span className="account-field-label">
                      Can’t scan the code?
                    </span>
                    <code>{enrollment.secret}</code>
                    <small>
                      Enter this key in your authenticator app. Keep it private
                      and save it somewhere secure so you can restore access if
                      you lose your device.
                    </small>
                  </div>
                </div>
                <label className={styles.backupAcknowledgment}>
                  <input
                    type="checkbox"
                    checked={setupKeySaved}
                    onChange={(event) => setSetupKeySaved(event.target.checked)}
                    disabled={pending}
                  />
                  <span>I’ve saved the setup key somewhere secure.</span>
                </label>
                <form
                  className={styles.verifyForm}
                  onSubmit={verifyAuthenticator}
                >
                  <label
                    className="account-field-label"
                    htmlFor="authenticator-setup-code"
                  >
                    Six-digit code
                  </label>
                  <input
                    className="account-input"
                    id="authenticator-setup-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={enrollmentCode}
                    onChange={(event) =>
                      setEnrollmentCode(
                        event.target.value.replace(/\D/g, "").slice(0, 6),
                      )
                    }
                    disabled={pending}
                    required
                  />
                  <div className={styles.inlineActions}>
                    <button
                      className="account-button-secondary"
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        void removeAuthenticator(enrollment.factorId);
                      }}
                    >
                      Cancel setup
                    </button>
                    <button
                      className="account-button"
                      type="submit"
                      disabled={
                        pending || enrollmentCode.length !== 6 || !setupKeySaved
                      }
                    >
                      {pending ? "Verifying…" : "Verify and turn on"}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </section>

          <section
            className="account-section"
            aria-labelledby="sessions-heading"
          >
            <div className="account-section-heading">
              <div className={styles.sectionIcon} aria-hidden="true">
                <MonitorSmartphone size={18} />
              </div>
              <div>
                <h2 id="sessions-heading">Active sessions</h2>
                <p>Review this sign-in and end access on your other devices.</p>
              </div>
            </div>
            <div className="account-row">
              <div className="account-row-copy">
                <strong>This device · Current session</strong>
                <span>
                  Last account sign-in {formatDate(state?.lastSignInAt ?? null)}
                </span>
              </div>
              <span className={styles.methodBadge}>
                <Check size={14} aria-hidden="true" />
                Active
              </span>
            </div>
            <div className="account-row">
              <div className="account-row-copy">
                <strong>Other sessions</strong>
                <span>
                  Sign out everywhere else while keeping this device signed in.
                </span>
              </div>
              {!confirmSignOutOthers ? (
                <button
                  className="account-button-secondary"
                  type="button"
                  disabled={signOutPending}
                  onClick={() => setConfirmSignOutOthers(true)}
                >
                  Sign out other sessions
                </button>
              ) : (
                <div className={styles.inlineActions}>
                  <button
                    className="account-button-secondary"
                    type="button"
                    disabled={signOutPending}
                    onClick={() => setConfirmSignOutOthers(false)}
                  >
                    Keep sessions
                  </button>
                  <button
                    className="account-button"
                    type="button"
                    disabled={signOutPending}
                    onClick={() => void signOutOtherSessions()}
                  >
                    {signOutPending ? "Signing out…" : "Confirm sign out"}
                  </button>
                </div>
              )}
            </div>
          </section>

          <section
            className="account-section"
            aria-labelledby="delete-account-heading"
          >
            <div className="account-row">
              <div className="account-row-copy">
                <h2 id="delete-account-heading">Request deletion</h2>
                <span>
                  Request permanent removal of your account and projects.
                </span>
              </div>
              <Link
                className="account-button-secondary"
                href="/settings/security/delete"
              >
                Request deletion
              </Link>
            </div>
          </section>
        </>
      )}
    </AccountShell>
  );
}
