"use client";

import { createContext, useContext, useEffect, useState } from "react";
import styles from "./theme-switch.module.css";

const ThemeContext = createContext({ darkTheme: false, toggleTheme: () => {} });
export function ThemeProvider({
  children,
  initialDark,
}: {
  children: React.ReactNode;
  initialDark: boolean;
}) {
  const [darkTheme, setDarkTheme] = useState(initialDark);
  useEffect(() => {
    document.documentElement.dataset.theme = darkTheme ? "dark" : "light";
    document.cookie = `runly-theme=${darkTheme ? "dark" : "light"}; Path=/; Max-Age=31536000; SameSite=Lax`;
    try {
      localStorage.setItem("runly:theme", darkTheme ? "dark" : "light");
    } catch {
      /* Theme remains usable without storage. */
    }
  }, [darkTheme]);
  return (
    <ThemeContext.Provider
      value={{ darkTheme, toggleTheme: () => setDarkTheme((value) => !value) }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
export function ThemeToggle() {
  const { darkTheme, toggleTheme } = useTheme();
  return (
    <input
      type="checkbox"
      className={styles.switch}
      checked={darkTheme}
      onChange={toggleTheme}
      aria-label="Dark theme"
      title={darkTheme ? "Use light theme" : "Use dark theme"}
    />
  );
}
