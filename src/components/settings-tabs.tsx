import Link from "next/link";

export function SettingsTabs({ active }: { active: "account" | "settings" }) {
  return (
    <nav className="settings-tabs" aria-label="Settings sections">
      <Link
        href="/settings"
        aria-current={active === "account" ? "page" : undefined}
        className={active === "account" ? "active" : ""}
      >
        Account
      </Link>
      <Link
        href="/settings/preferences"
        aria-current={active === "settings" ? "page" : undefined}
        className={active === "settings" ? "active" : ""}
      >
        Settings
      </Link>
    </nav>
  );
}
