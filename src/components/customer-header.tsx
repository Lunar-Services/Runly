"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import { Brand } from "./brand";
import styles from "./customer-header.module.css";

export type CustomerAccount = {
  email: string;
  displayName: string;
  avatarUrl: string;
  fullName?: string;
  githubLinked?: boolean;
};
const destinations = [
  ["/create", "Create"],
  ["/pricing", "Plans"],
  ["/support", "Support"],
] as const;

export function CustomerHeader({
  account: suppliedAccount,
  showAccount = true,
  morphOnScroll = false,
  showNavigation = true,
}: {
  account?: CustomerAccount | null;
  showAccount?: boolean;
  morphOnScroll?: boolean;
  showNavigation?: boolean;
}) {
  const [fetchedAccount, setFetchedAccount] = useState<CustomerAccount | null>(
    null,
  );
  const account =
    suppliedAccount === undefined ? fetchedAccount : suppliedAccount;
  const [menu, setMenu] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [compact, setCompact] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const logoutLock = useRef(false);
  const container = useRef<HTMLElement>(null);
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (!morphOnScroll) return;
    function update() {
      setCompact(window.scrollY > 64);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [morphOnScroll]);
  async function logout() {
    if (logoutLock.current) return;
    logoutLock.current = true;
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Couldn't log out. Please try again.");
      setMenu(false);
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Couldn't log out. Please try again.");
    } finally {
      logoutLock.current = false;
      setLoggingOut(false);
    }
  }
  useEffect(() => {
    if (suppliedAccount !== undefined) return;
    const controller = new AbortController();
    fetch("/api/account", { signal: controller.signal })
      .then(async (r) => (r.ok ? r.json() : null))
      .then(setFetchedAccount)
      .catch(() => {});
    return () => controller.abort();
  }, [suppliedAccount]);
  useEffect(() => {
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) {
        setMenu(false);
        setMobile(false);
      }
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu(false);
        setMobile(false);
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  const initials =
    account?.displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() ||
    account?.email[0]?.toUpperCase() ||
    "R";
  return (
    <header
      ref={container}
      className={`${styles.header} ${morphOnScroll ? styles.morph : ""} ${morphOnScroll && compact ? styles.compact : ""}`}
    >
      <Link href="#customer-content" className={styles.skip}>
        Skip to content
      </Link>
      <Brand className={styles.brand} logoSrc="/brand/figma/runly-mark.png" />
      {showNavigation && (
        <nav className={styles.navigation} aria-label="Main navigation">
          {destinations.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
      )}
      <div className={styles.actions}>
        {showAccount &&
          (account ? (
            <div className={styles.account}>
              <button
                type="button"
                className={styles.accountTrigger}
                aria-label="Open account menu"
                aria-expanded={menu}
                aria-controls="customer-account-menu"
                onClick={() => setMenu(!menu)}
              >
                <span
                  className={styles.avatar}
                  style={
                    account.avatarUrl
                      ? { backgroundImage: `url(${account.avatarUrl})` }
                      : undefined
                  }
                >
                  {!account.avatarUrl && initials}
                </span>
                <ChevronDown size={15} />
              </button>
              {menu && (
                <nav
                  id="customer-account-menu"
                  className={styles.dropdown}
                  aria-label="Your account"
                >
                  <span className={styles.identity}>
                    <strong>{account.displayName || "Your account"}</strong>
                    <small>{account.email}</small>
                  </span>
                  <Link
                    href="/dashboard/projects"
                    onClick={() => setMenu(false)}
                  >
                    Workspace
                  </Link>
                  <Link href="/settings" onClick={() => setMenu(false)}>
                    Account
                  </Link>
                  <button
                    type="button"
                    onClick={logout}
                    disabled={loggingOut}
                    aria-busy={loggingOut}
                  >
                    {loggingOut ? "Logging out…" : "Logout"}
                  </button>
                  {logoutError && (
                    <p className={styles.logoutError} role="alert">
                      {logoutError}
                    </p>
                  )}
                </nav>
              )}
            </div>
          ) : (
            <>
              <Link className={styles.login} href="/login">
                Log in
              </Link>
              <Link className={styles.primary} href="/signup">
                Get started
              </Link>
            </>
          ))}
        {showNavigation && (
          <button
            type="button"
            className={styles.mobileToggle}
            aria-label={mobile ? "Close navigation" : "Open navigation"}
            aria-expanded={mobile}
            aria-controls="customer-mobile-menu"
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X size={21} /> : <Menu size={21} />}
          </button>
        )}
      </div>
      {showNavigation && mobile && (
        <nav
          id="customer-mobile-menu"
          className={styles.mobileMenu}
          aria-label="Mobile navigation"
        >
          {destinations.map(([href, label]) => (
            <Link key={href} href={href} onClick={() => setMobile(false)}>
              {label}
            </Link>
          ))}
          {account && (
            <Link href="/settings" onClick={() => setMobile(false)}>
              Your account
            </Link>
          )}
        </nav>
      )}
    </header>
  );
}
