"use client";

import { useCallback, useEffect, useState } from "react";
import { AccountShell } from "./account-shell";
import styles from "./account-deletion-request.module.css";

type RequestState = {
  status: "pending" | "cancelled";
  requestedAt: string;
  cancelledAt: string | null;
};

type DeletionState = { email: string; request: RequestState | null };

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function AccountDeletionRequest() {
  const [state, setState] = useState<DeletionState | null>(null);
  const [email, setEmail] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeIsError, setNoticeIsError] = useState(false);

  const loadRequest = useCallback(async () => {
    try {
      const response = await fetch("/api/account/deletion-request", {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't load your request.");
      const loaded = result as DeletionState;
      setState(loaded);
      setEmail("");
      setNotice("");
      setNoticeIsError(false);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Couldn't load your request.",
      );
      setNoticeIsError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRequest(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRequest]);

  async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !acknowledged) return;
    setPending(true);
    setNotice("");
    try {
      const response = await fetch("/api/account/deletion-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, acknowledge: acknowledged }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't record your request.");
      setNotice(result.message || "Your request was recorded for review.");
      setNoticeIsError(false);
      setLoading(true);
      await loadRequest();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't record your request.",
      );
      setNoticeIsError(true);
    } finally {
      setPending(false);
    }
  }

  async function cancelRequest() {
    if (pending) return;
    setPending(true);
    setNotice("");
    try {
      const response = await fetch("/api/account/deletion-request", {
        method: "DELETE",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't cancel your request.");
      setNotice(result.message || "Deletion request cancelled.");
      setNoticeIsError(false);
      setLoading(true);
      await loadRequest();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "Couldn't cancel your request.",
      );
      setNoticeIsError(true);
    } finally {
      setPending(false);
    }
  }

  const request = state?.request;
  const isPending = request?.status === "pending";

  return (
    <AccountShell
      title="Request account deletion"
      description="Ask Runly to permanently remove your account and projects."
    >
      <section className="account-section" aria-labelledby="deletion-review">
        <h2 id="deletion-review">Operator review</h2>
        <p>
          Submitting this form stores a deletion request for operator review. It
          does not immediately delete your account, projects, or files, and it
          does not cancel a paid subscription. An operator must review the
          request and complete required billing and project cleanup first. Your
          account remains active while the request is pending.
        </p>

        {notice && (
          <div
            className="account-notice"
            role={noticeIsError ? "alert" : "status"}
            aria-live={noticeIsError ? "assertive" : "polite"}
          >
            {notice}
          </div>
        )}

        {loading ? (
          <p role="status">Loading deletion request…</p>
        ) : isPending ? (
          <div className="account-row">
            <div className="account-row-copy">
              <strong>Request pending review</strong>
              <span>Submitted {formatDate(request.requestedAt)}</span>
              <span>
                Your account, projects, and billing remain active until an
                operator completes the review.
              </span>
            </div>
            <button
              className="account-button-secondary"
              type="button"
              disabled={pending}
              onClick={() => void cancelRequest()}
            >
              {pending ? "Cancelling…" : "Cancel request"}
            </button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submitRequest}>
            {request?.status === "cancelled" && (
              <div className="account-row">
                <div className="account-row-copy">
                  <strong>Previous request cancelled</strong>
                  <span>
                    Cancelled{" "}
                    {formatDate(request.cancelledAt ?? request.requestedAt)}
                  </span>
                </div>
              </div>
            )}
            <label className={styles.emailField}>
              <span className="account-field-label">
                Confirm your account email
              </span>
              <input
                className="account-input"
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <small>
                Enter the email address shown on your Runly account.
              </small>
            </label>
            <label className={styles.acknowledgment}>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                required
              />
              <span>
                I understand this request is stored for operator review. It does
                not immediately delete my account or cancel billing.
              </span>
            </label>
            <div className="account-form-actions">
              <button
                className="account-button"
                type="submit"
                disabled={pending || !acknowledged || !email.trim()}
              >
                {pending ? "Submitting…" : "Submit deletion request"}
              </button>
            </div>
          </form>
        )}
      </section>
    </AccountShell>
  );
}
