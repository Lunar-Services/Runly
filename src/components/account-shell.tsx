"use client";
import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { CustomerHeader, type CustomerAccount } from "./customer-header";
import { ThemeToggle } from "./theme-provider";
import "./account.css";

type AccountState = {
  account: CustomerAccount | null;
  loading: boolean;
  error: string;
  reload: () => void;
};
const AccountContext = createContext<AccountState>({
  account: null,
  loading: true,
  error: "",
  reload: () => {},
});
export const useCustomerAccount = () => useContext(AccountContext);
const links = [
  ["/settings", "Profile", "profile"],
  ["/settings/security", "Security", "security"],
  ["/settings/notifications", "Notifications", "notifications"],
  ["/settings/billing", "Billing & plan", "billing"],
] as const;

export function AccountShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const [account, setAccount] = useState<CustomerAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "Couldn't load your account.");
        return data;
      })
      .then(setAccount)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    const update = () => {
      setLoading(true);
      setError("");
      setRevision((v) => v + 1);
    };
    window.addEventListener("runly-profile-updated", update);
    return () => window.removeEventListener("runly-profile-updated", update);
  }, []);
  async function signOut() {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Couldn't sign out. Try again.");
      router.replace("/login");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign out.");
      setPending(false);
    }
  }
  return (
    <AccountContext.Provider
      value={{
        account,
        loading,
        error,
        reload: () => {
          setLoading(true);
          setError("");
          setRevision((v) => v + 1);
        },
      }}
    >
      <div className="customer-account account-frame">
        <CustomerHeader account={account} showAccount={!loading} />
        <div className="account-layout">
          <aside className="account-sidebar">
            <div className="account-sidebar-navigation">
              <Link className="account-back" href="/dashboard/projects">
                <Image
                  src="/figma/account/back.svg"
                  alt=""
                  width={20}
                  height={20}
                />
                Back to workspace
              </Link>
              <p className="account-nav-label">Your account</p>
              <nav aria-label="Account settings">
                {links.map(([href, label, icon]) => (
                  <Link
                    key={href}
                    href={href}
                    aria-current={
                      (
                        href === "/settings"
                          ? path === href
                          : path.startsWith(href)
                      )
                        ? "page"
                        : undefined
                    }
                  >
                    <Image
                      src={`/figma/account/${icon}.svg`}
                      alt=""
                      width={18}
                      height={18}
                    />
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="account-sidebar-bottom">
              <label className="account-appearance">
                <span>Dark appearance</span>
                <ThemeToggle />
              </label>
              <button
                type="button"
                className="account-signout"
                disabled={pending}
                onClick={signOut}
              >
                {pending ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </aside>
          <main id="customer-content" className="account-content">
            <header className="account-heading">
              <h1>{title}</h1>
              {description && <p>{description}</p>}
            </header>
            {error && (
              <div className="account-notice" role="alert">
                {error}{" "}
                <button onClick={() => setRevision((v) => v + 1)}>
                  Try again
                </button>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>
    </AccountContext.Provider>
  );
}
