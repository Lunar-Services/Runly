import { AuthPanel } from "@/components/auth-panel";
import { AuthEntryUI } from "@/components/auth-entry-ui";
import { ProductScreen } from "@/components/product-screen";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WorkspaceClient } from "@/components/workspace-client";
import type { WorkspaceView } from "@/lib/workspace-ui-fixtures";
import { AccountSettings } from "@/components/account-settings";
import { AccountSecurity } from "@/components/account-security";
import { AccountDeletionRequest } from "@/components/account-deletion-request";
import { AccountNotifications } from "@/components/account-notifications";
import {
  BillingSettings,
  BillingManage,
  UpgradePlans,
} from "@/components/billing";
import { LandingPage } from "@/components/landing-page";
import { SupportPage } from "@/components/support-page";
import { safeAppPath } from "@/lib/api";
import type { Metadata } from "next";
import { customerAccount } from "@/lib/customer-account";
import { AdminDashboard, type AdminTab } from "@/components/admin-dashboard";
import { PaymentSuccess } from "@/components/payment-success";
import { CheckoutPage } from "@/components/checkout-page";
import { PricingUI, type Plan } from "@/components/pricing-ui";
import { adminClient } from "@/lib/api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const names: Record<string, string> = {
    create: "Start creating",
    support: "Support",
    pricing: "Plans",
    "dashboard/projects": "Your workspace",
    "dashboard/projects/new": "Create a project",
    workspace: "Your workspace",
    "workspace/new": "New project",
    "workspace/website": "Offscript website",
    "workspace/app": "Daylight app",
    "workspace/video": "Cloud nine edit",
    "workspace/editor": "Project editor",
    settings: "Your profile",
    "settings/security": "Security",
    "settings/security/password": "Email password",
    "settings/security/delete": "Request account deletion",
    "settings/notifications": "Notifications",
    "settings/billing": "Billing & plan",
    "settings/billing/upgrade": "Choose your plan",
    "settings/billing/manage": "Manage subscription",
    "settings/billing/payment": "Payment method",
    "settings/billing/details": "Billing details",
    "settings/billing/success": "Payment confirmation",
    "settings/billing/checkout": "Review your checkout",
    "verify-mfa": "Verify your sign-in",
    admin: "Admin overview",
    "admin/users": "Admin users",
    "admin/projects": "Admin projects",
    "admin/usage": "Admin AI usage",
    "admin/billing": "Admin billing",
    "admin/activity": "Admin activity log",
    "admin/settings": "Admin settings",
    "admin/swiftlet": "Admin Swiftlet",
    "admin/nests": "Admin Nests",
    "admin/billing/catalog": "Admin billing catalog",
    "admin/ai-providers": "Admin AI providers",
    "admin/legal": "Admin legal documents",
  };
  const title = names[slug.join("/")];
  return title
    ? {
        title,
        ...(slug[0] === "settings" ||
        slug[0] === "verify-mfa" ||
        slug[0] === "workspace" ||
        slug[0] === "admin"
          ? { robots: { index: false, follow: false } }
          : {}),
      }
    : {};
}

const supported = new Set([
  "login",
  "signup",
  "verify-email",
  "forgot-password",
  "reset-password",
  "verify-mfa",
  "pricing",
  "create",
  "how-it-works",
  "explore",
  "support",
  "dashboard/projects/new",
  "cowork",
  "settings",
  "settings/preferences",
  "settings/security",
  "settings/security/delete",
  "settings/security/password",
  "settings/notifications",
  "settings/billing",
  "settings/billing/upgrade",
  "settings/billing/manage",
  "settings/billing/payment",
  "settings/billing/details",
  "settings/billing/success",
  "settings/billing/checkout",
  "admin",
  "admin/users",
  "admin/projects",
  "admin/billing",
  "admin/billing/catalog",
  "admin/usage",
  "admin/activity",
  "admin/settings",
  "admin/swiftlet",
  "admin/nests",
  "admin/ai-providers",
  "admin/legal",
]);

export default async function CatchAllPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const route = slug.join("/");
  // Local UI fixtures contain no account or project data. Real project routes
  // continue through the authentication and MFA checks below.
  if (slug[0] === "workspace") {
    const view = slug[1] || "new";
    if (
      slug.length > 2 ||
      !["new", "website", "app", "video", "editor"].includes(view)
    )
      notFound();
    if (
      view !== "new" &&
      process.env.NODE_ENV === "development" &&
      (await searchParams).preview === "true"
    )
      return <WorkspaceClient key={view} initialView={view as WorkspaceView} />;
    redirect("/dashboard/projects/new");
  }
  const offerPreview =
    process.env.NODE_ENV === "development" &&
    (await searchParams).offer === "preview";
  if (["dashboard", "project", "project/new"].includes(route))
    redirect("/dashboard/projects");
  if (route === "settings/account") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(await searchParams)) {
      if (typeof value === "string") query.append(key, value);
      else if (Array.isArray(value))
        value.forEach((part) => query.append(key, part));
    }
    redirect(`/settings${query.size ? `?${query}` : ""}`);
  }
  const projectRoute =
    slug.length === 2 &&
    slug[0] === "project" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      slug[1],
    );
  if (!supported.has(route) && route !== "dashboard/projects" && !projectRoute)
    notFound();
  if (route === "settings/preferences") redirect("/settings/notifications");
  if (route === "how-it-works") redirect("/create#how-it-works");
  if (route === "explore") redirect("/create#explore");
  if (route === "support") return <SupportPage />;
  if (route === "pricing") {
    let plans: Plan[] = [];
    let planError = "";
    try {
      const { data, error } = await adminClient()
        .from("subscription_plans")
        .select(
          "id,name,price_cents,window_3h_tokens,window_7d_tokens,project_cap",
        )
        .eq("active", true)
        .not("stripe_product_id", "is", null)
        .order("price_cents", { ascending: true });
      if (error) throw error;
      plans = (data || []).map((plan) => ({
        ...plan,
        cadence: "month",
        currency: "usd",
      }));
    } catch {
      planError = "Couldn't load published plans. Please refresh to try again.";
    }
    return <PricingUI initialPlans={plans} initialError={planError} />;
  }
  if (route === "create") {
    const query = await searchParams;
    const ideas: Record<string, string> = {
      website: "Build a website for my creative studio.",
      app: "Build a useful app for my daily routine.",
      video: "Help me plan a short video with a clear story.",
    };
    const account = await customerAccount();
    return (
      <LandingPage
        key={typeof query.idea === "string" ? query.idea : "create"}
        account={account}
        initialPrompt={
          typeof query.idea === "string" ? ideas[query.idea] || "" : ""
        }
      />
    );
  }
  if (slug[0] === "login" || slug[0] === "signup") {
    const query = await searchParams;
    if (query.method !== "password")
      return (
        <AuthEntryUI
          key={slug[0]}
          mode={slug[0]}
          next={
            typeof query.next === "string"
              ? safeAppPath(query.next)
              : "/workspace/new"
          }
        />
      );
    return (
      <AuthPanel
        key={slug[0]}
        mode={slug[0]}
        initialNext={safeAppPath(query.next)}
      />
    );
  }
  if (slug[0] === "verify-email") {
    const query = await searchParams;
    return (
      <AuthPanel
        mode="verify"
        initialEmail={
          typeof query.email === "string" ? query.email.slice(0, 254) : ""
        }
        initialNext={safeAppPath(query.next)}
        emailCode={query.flow === "email"}
        initialTokenHash={
          typeof query.token_hash === "string"
            ? query.token_hash.slice(0, 512)
            : ""
        }
      />
    );
  }
  if (slug[0] === "forgot-password") return <AuthPanel mode="forgot" />;
  if (slug[0] === "reset-password") return <AuthPanel mode="reset" />;
  if (slug[0] === "verify-mfa") {
    const query = await searchParams;
    const next = safeAppPath(query.next);
    const db = await createServerSupabaseClient();
    if (!db) redirect("/login?error=unavailable");
    const { data: userData } = await db.auth.getUser();
    if (!userData.user?.email_confirmed_at) redirect("/login");
    const { data: assurance, error } =
      await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) redirect("/login?error=security_check_unavailable");
    if (assurance?.nextLevel !== "aal2" || assurance.currentLevel === "aal2")
      redirect(next);
    return <AuthPanel mode="mfa" initialNext={next} />;
  }
  if (
    ["dashboard", "project", "cowork", "settings", "admin"].includes(slug[0])
  ) {
    let loginPath = "/login";
    if (
      ["settings/billing/success", "settings/billing/checkout"].includes(route)
    ) {
      const query = await searchParams;
      const returnQuery = new URLSearchParams();
      if (typeof query.session_id === "string")
        returnQuery.set("session_id", query.session_id.slice(0, 256));
      if (process.env.NODE_ENV === "development" && query.preview === "true")
        returnQuery.set("preview", "true");
      if (route === "settings/billing/checkout") {
        if (typeof query.plan === "string")
          returnQuery.set("plan", query.plan.slice(0, 64));
        if (query.change === "true") returnQuery.set("change", "true");
      }
      loginPath = `/login?next=${encodeURIComponent(`/${route}${returnQuery.size ? `?${returnQuery}` : ""}`)}`;
    }
    const db = await createServerSupabaseClient();
    if (!db) redirect(loginPath);
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user || !user.email_confirmed_at) redirect(loginPath);
    const { data: assurance, error: assuranceError } =
      await db.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError) redirect("/login?error=security_check_unavailable");
    if (assurance?.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
      const query = await searchParams;
      const parameters = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (typeof value === "string") parameters.append(key, value);
        else if (Array.isArray(value))
          value.forEach((part) => parameters.append(key, part));
      }
      const originalPath = `/${route}${parameters.size ? `?${parameters}` : ""}`;
      redirect(`/verify-mfa?next=${encodeURIComponent(originalPath)}`);
    }
    if (slug[0] === "admin") {
      const { data, error } = await db
        .from("account_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (error || !data) notFound();
    }
  }
  if (route === "dashboard/projects/new") return <WorkspaceClient />;
  if (projectRoute) {
    const projectQuery = await searchParams;
    return (
      <WorkspaceClient
        key={slug[1]}
        initialView={projectQuery.view === "editor" ? "editor" : "website"}
        projectId={slug[1]}
      />
    );
  }
  if (
    slug[0] === "admin" &&
    !["admin/billing/catalog", "admin/ai-providers", "admin/legal"].includes(
      route,
    )
  ) {
    const account = await customerAccount();
    if (!account || account.role !== "admin") notFound();
    const query = await searchParams;
    return (
      <AdminDashboard
        key={route}
        tab={(slug[1] || "overview") as AdminTab}
        account={account}
        initialQuery={typeof query.q === "string" ? query.q.slice(0, 200) : ""}
        initialStatus={typeof query.status === "string" ? query.status : ""}
      />
    );
  }
  if (slug[0] === "dashboard") return <WorkspaceClient />;
  if (slug.length === 1 && slug[0] === "settings") return <AccountSettings />;
  if (route === "settings/security") return <AccountSecurity />;
  if (route === "settings/security/password")
    return <AccountSecurity passwordOnly />;
  if (route === "settings/security/delete") return <AccountDeletionRequest />;
  if (route === "settings/notifications") return <AccountNotifications />;
  if (route === "settings/billing/checkout") {
    const query = await searchParams;
    return (
      <CheckoutPage
        key={`${query.plan}:${query.change}:${query.preview}`}
        planId={typeof query.plan === "string" ? query.plan.slice(0, 64) : ""}
        changingPlan={query.change === "true"}
        preview={
          process.env.NODE_ENV === "development" && query.preview === "true"
        }
      />
    );
  }
  if (route === "settings/billing/success") {
    const query = await searchParams;
    return (
      <PaymentSuccess
        key={`${typeof query.session_id === "string" ? query.session_id : ""}:${query.preview === "true"}`}
        sessionId={
          typeof query.session_id === "string"
            ? query.session_id.slice(0, 256)
            : ""
        }
        preview={
          process.env.NODE_ENV === "development" && query.preview === "true"
        }
      />
    );
  }
  if (route === "settings/billing") {
    const query = await searchParams;
    if (query.checkout === "success") {
      const sessionQuery =
        typeof query.session_id === "string"
          ? `?session_id=${encodeURIComponent(query.session_id.slice(0, 256))}`
          : "";
      redirect(`/settings/billing/success${sessionQuery}`);
    }
    return <BillingSettings offerPreview={offerPreview} />;
  }
  if (route === "settings/billing/upgrade") return <UpgradePlans />;
  if (route === "settings/billing/manage") return <BillingManage />;
  if (route === "settings/billing/payment")
    return <BillingManage mode="payment" />;
  if (route === "settings/billing/details")
    return <BillingManage mode="details" />;
  return <ProductScreen slug={slug} />;
}
