"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Blocks,
  CreditCard,
  FolderKanban,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Scale,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "./theme-provider";
import { Brand } from "./brand";

type NavigationItem = readonly [href: string, label: string, Icon: LucideIcon];

const items: readonly NavigationItem[] = [
  ["/dashboard", "Overview", LayoutDashboard],
  ["/dashboard/projects", "Projects", FolderKanban],
  ["/cowork", "Cowork", Users],
  ["/settings/billing", "Billing", CreditCard],
  ["/settings", "Settings", Settings],
];
const adminItems: readonly NavigationItem[] = [
  ["/admin", "Admin", Blocks],
  ["/admin/billing", "Billing catalog", CreditCard],
  ["/admin/usage", "Usage", BarChart3],
  ["/admin/ai-providers", "AI providers", KeyRound],
  ["/admin/legal", "Legal", Scale],
];

export function AppShell({
  children,
  title,
  eyebrow = "Workspace",
}: {
  children: React.ReactNode;
  title: string;
  eyebrow?: string;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cancellation, setCancellation] = useState<{
    plan: string;
    currentPeriodEnd: string;
  } | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [account, setAccount] = useState<{
    displayName: string;
    email: string;
    avatarUrl: string;
    role: "user" | "admin";
  } | null>(null);
  const { darkTheme, toggleTheme } = useTheme();
  const router = useRouter();
  useEffect(() => {
    async function loadAccount() {
      const response = await fetch("/api/account");
      if (response.ok) setAccount(await response.json());
    }
    const controller = new AbortController();
    fetch("/api/account", { signal: controller.signal })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data) setAccount(data);
      })
      .catch(() => undefined);
    window.addEventListener("runly-profile-updated", loadAccount);
    return () => {
      controller.abort();
      window.removeEventListener("runly-profile-updated", loadAccount);
    };
  }, []);
  useEffect(() => {
    fetch("/api/billing")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        const subscription = data?.subscription;
        if (subscription?.cancelAtPeriodEnd && subscription.currentPeriodEnd)
          setCancellation({
            plan: subscription.plan,
            currentPeriodEnd: subscription.currentPeriodEnd,
          });
      })
      .catch(() => undefined);
  }, []);
  async function signOut() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Couldn't sign out. Please try again.");
      router.replace("/login");
      router.refresh();
    } catch {
      setError("Couldn't sign out. Please try again.");
    } finally {
      setPending(false);
    }
  }
  const links: readonly NavigationItem[] = path.startsWith("/admin")
    ? adminItems
    : account?.role === "admin"
      ? [...items, ["/admin", "Admin", Blocks]]
      : items;
  const initials =
    account?.displayName
      ?.trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() ||
    account?.email?.slice(0, 1).toUpperCase() ||
    "R";
  return (
    <div className={`app-shell${darkTheme ? " is-dark" : ""}`}>
      <aside className={open ? "app-sidebar is-open" : "app-sidebar"}>
        <div className="sidebar-head">
          <Brand />
          <button onClick={() => setOpen(false)} aria-label="Close navigation">
            <X />
          </button>
        </div>
        <nav aria-label="Workspace navigation">
          {links.map(([href, label, Icon]) => (
            <Link
              className={path === href ? "active" : ""}
              href={href}
              key={href}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link className="account-summary" href="/settings">
            <span
              className="profile-avatar"
              style={
                account?.avatarUrl
                  ? { backgroundImage: `url(${account.avatarUrl})` }
                  : undefined
              }
            >
              {!account?.avatarUrl && initials}
            </span>
            <span>
              <strong>{account?.displayName || "Your account"}</strong>
              <small>{account?.email || "Profile settings"}</small>
            </span>
          </Link>
          <button
            className="button sign-out-button"
            onClick={signOut}
            disabled={pending}
            aria-busy={pending}
          >
            <LogOut size={17} />
            {pending ? "Signing out…" : "Sign out"}
          </button>
          {error && <p role="alert">{error}</p>}
        </div>
      </aside>
      <main className="app-main">
        <header className="app-topbar">
          <button
            className="app-menu"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </button>
          <div>
            <p>{eyebrow}</p>
            <h1>{title}</h1>
          </div>
          <button
            className="theme-toggle app-theme-toggle"
            type="button"
            onClick={toggleTheme}
            aria-pressed={darkTheme}
            aria-label={darkTheme ? "Use light theme" : "Use dark theme"}
          >
            {darkTheme ? <Sun size={17} /> : <Moon size={17} />}
          </button>
        </header>
        <div className="app-content">
          {cancellation && !bannerDismissed && (
            <div className="cancellation-banner" role="status">
              <span>
                Your {cancellation.plan[0]?.toUpperCase()}
                {cancellation.plan.slice(1)} plan ends{" "}
                {new Date(cancellation.currentPeriodEnd).toLocaleDateString()}.
                You may{" "}
                <Link href="/settings/billing">
                  withdraw your cancellation at Billing
                </Link>
                .
              </span>
              <button
                className="cancellation-banner-close"
                aria-label="Dismiss cancellation notice"
                onClick={() => setBannerDismissed(true)}
              >
                ×
              </button>
            </div>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
