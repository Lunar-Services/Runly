"use client";

import { useEffect, useRef, useState } from "react";
import { AccountShell } from "./account-shell";

type Preferences = {
  projectUpdates: boolean;
  teamActivity: boolean;
  productUpdates: boolean;
  tipsAndInspiration: boolean;
};

const choices: {
  key: keyof Preferences;
  label: string;
  description: string;
}[] = [
  {
    key: "projectUpdates",
    label: "Project updates",
    description: "Preferences for project progress and changes.",
  },
  {
    key: "teamActivity",
    label: "Team activity",
    description: "Preferences for activity in your shared projects.",
  },
  {
    key: "productUpdates",
    label: "Product updates",
    description: "News about Runly features and improvements.",
  },
  {
    key: "tipsAndInspiration",
    label: "Tips & inspiration",
    description: "Ideas and guidance for your next project.",
  },
];

function readPreferences(value: unknown): Preferences {
  if (
    !value ||
    typeof value !== "object" ||
    choices.some(({ key }) => typeof (value as Preferences)[key] !== "boolean")
  )
    throw new Error("Couldn't load your notification preferences.");
  const result = value as Preferences;
  return {
    projectUpdates: result.projectUpdates,
    teamActivity: result.teamActivity,
    productUpdates: result.productUpdates,
    tipsAndInspiration: result.tipsAndInspiration,
  };
}

export function AccountNotifications() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saved, setSaved] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const lock = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/notifications", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.message || "Couldn't load your preferences.");
        return readPreferences(result);
      })
      .then((result) => {
        setPreferences(result);
        setSaved(result);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setFailed(true);
        setMessage(
          error instanceof Error
            ? error.message
            : "Couldn't load your preferences.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reload]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preferences || lock.current) return;
    lock.current = true;
    setPending(true);
    setFailed(false);
    setMessage("");
    try {
      const response = await fetch("/api/account/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.message || "Couldn't save your preferences.");
      const next = readPreferences(result);
      setPreferences(next);
      setSaved(next);
      setMessage("Notification preferences saved.");
    } catch (error) {
      setFailed(true);
      setMessage(
        error instanceof Error
          ? error.message
          : "Couldn't save your preferences.",
      );
    } finally {
      lock.current = false;
      setPending(false);
    }
  }

  const changed = Boolean(
    preferences &&
      saved &&
      choices.some(({ key }) => preferences[key] !== saved[key]),
  );

  return (
    <AccountShell
      title="Notifications"
      description="Choose the updates you want to hear about."
    >
      {message && (
        <p className="account-notice" role={failed ? "alert" : "status"}>
          {message}
        </p>
      )}
      {loading ? (
        <p className="account-notice" role="status">
          Loading your preferences…
        </p>
      ) : !preferences ? (
        <button
          className="account-button"
          onClick={() => {
            setLoading(true);
            setFailed(false);
            setMessage("");
            setReload((value) => value + 1);
          }}
        >
          Try again
        </button>
      ) : (
        <form onSubmit={save} aria-busy={pending}>
          <section
            className="account-section account-notification-list"
            aria-label="Notification preferences"
          >
            {choices.map(({ key, label, description }) => (
              <div className="account-row" key={key}>
                <div>
                  <label htmlFor={`notification-${key}`}>
                    <strong>{label}</strong>
                  </label>
                  <p id={`notification-${key}-description`}>{description}</p>
                </div>
                <label className="account-switch">
                  <input
                    id={`notification-${key}`}
                    type="checkbox"
                    role="switch"
                    aria-label={label}
                    aria-describedby={`notification-${key}-description`}
                    checked={preferences[key]}
                    disabled={pending}
                    onChange={(event) => {
                      setPreferences({
                        ...preferences,
                        [key]: event.target.checked,
                      });
                      setMessage("");
                    }}
                  />
                  <span aria-hidden="true" />
                </label>
              </div>
            ))}
          </section>
          <p className="account-notice">
            Your preferences are saved to your account. Essential security and
            billing notices cannot be switched off.
          </p>
          <button
            className="account-button"
            type="submit"
            disabled={pending || !changed}
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        </form>
      )}
    </AccountShell>
  );
}
