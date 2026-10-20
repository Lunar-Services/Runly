"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import styles from "./theme-switch.module.css";

const ThemeContext = createContext({
  darkTheme: false,
  syncError: "",
  toggleTheme: () => {},
});
export function ThemeProvider({
  children,
  initialDark,
}: {
  children: React.ReactNode;
  initialDark: boolean;
}) {
  const [darkTheme, setDarkTheme] = useState(initialDark);
  const [syncError, setSyncError] = useState("");
  const changedByUser = useRef(false);
  useEffect(() => {
    document.documentElement.dataset.theme = darkTheme ? "dark" : "light";
    document.cookie = `runly-theme=${darkTheme ? "dark" : "light"}; Path=/; Max-Age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem("runly:theme", darkTheme ? "dark" : "light");
    } catch {
      /* Theme remains usable without storage. */
    }
  }, [darkTheme]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/preferences", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const result = await response.json();
        if (
          !changedByUser.current &&
          (result.theme === "dark" || result.theme === "light")
        )
          setDarkTheme(result.theme === "dark");
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  async function toggleTheme() {
    const next = !darkTheme;
    changedByUser.current = true;
    setDarkTheme(next);
    setSyncError("");
    try {
      const response = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: next ? "dark" : "light" }),
      });
      if (!response.ok && response.status !== 401) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          result.message || "Couldn't save your theme preference.",
        );
      }
      if (response.status === 401)
        setSyncError(
          "Theme changed on this device; sign in to sync it across devices.",
        );
    } catch {
      setSyncError(
        "Theme changed on this device, but your account preference could not be saved.",
      );
    }
  }
  return (
    <ThemeContext.Provider value={{ darkTheme, syncError, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
export function ThemeToggle() {
  const { darkTheme, syncError, toggleTheme } = useTheme();
  return (
    <>
      <input
        type="checkbox"
        className={styles.switch}
        checked={darkTheme}
        onChange={toggleTheme}
        aria-label="Dark theme"
        title={darkTheme ? "Use light theme" : "Use dark theme"}
        aria-describedby={syncError ? "theme-sync-status" : undefined}
      />
      {syncError && (
        <span id="theme-sync-status" role="status" className={styles.srOnly}>
          {syncError}
        </span>
      )}
    </>
  );
}
