import { AuthPanel } from "@/components/auth-panel";
import { ProductScreen } from "@/components/product-screen";
import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ProjectsDashboard } from "@/components/projects-dashboard";
import { AccountSettings } from "@/components/account-settings";

const supported = [
  "login",
  "signup",
  "verify-email",
  "forgot-password",
  "reset-password",
  "pricing",
  "dashboard",
  "project",
  "cowork",
  "settings",
  "admin",
  "terms",
  "privacy",
];

export default async function CatchAllPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<{
    email?: string | string[];
    token_hash?: string | string[];
  }>;
}) {
  const { slug } = await params;
  if (!supported.includes(slug[0])) notFound();
  if (slug[0] === "login" || slug[0] === "signup")
    return <AuthPanel mode={slug[0]} />;
  if (slug[0] === "verify-email") {
    const query = await searchParams;
    return (
      <AuthPanel
        mode="verify"
        initialEmail={
          typeof query.email === "string" ? query.email.slice(0, 254) : ""
        }
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
  if (
    ["dashboard", "project", "cowork", "settings", "admin"].includes(slug[0])
  ) {
    const db = await createServerSupabaseClient();
    if (!db) redirect("/login");
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user || !user.email_confirmed_at) redirect("/login");
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
  if (slug[0] === "dashboard") return <ProjectsDashboard />;
  if (slug.length === 1 && slug[0] === "settings") return <AccountSettings />;
  return <ProductScreen slug={slug} />;
}
