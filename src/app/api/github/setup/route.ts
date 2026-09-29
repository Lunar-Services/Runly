import { NextResponse } from "next/server";
import {
  adminClient,
  ApiError,
  appOrigin,
  rateLimit,
  session,
} from "@/lib/api";
import { installation, linkedGithubUserId } from "@/lib/github";
import { verifyTicket } from "@/lib/runtime/shared";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = appOrigin(request);
  try {
    const { db, user } = await session();
    await rateLimit(request, "github-setup", user.id, 10);
    const token = url.searchParams.get("state") || "";
    const secret = process.env.RUNLY_RUNTIME_SECRET || "";
    if (secret.length < 32)
      throw new ApiError(503, "GitHub setup is unavailable.");
    const state = verifyTicket(token, secret);
    if (
      state.project !== "github-install" ||
      state.gateway !== "setup" ||
      state.user !== user.id
    )
      throw new ApiError(403, "GitHub setup could not be verified.");
    const id = Number(url.searchParams.get("installation_id"));
    if (!Number.isSafeInteger(id) || id < 1)
      throw new ApiError(400, "Invalid GitHub installation.");
    const githubId = await linkedGithubUserId(db);
    if (!githubId) throw new ApiError(403, "Link your GitHub account first.");
    const linked = await installation(id);
    // Personal installations are associated with the authenticated GitHub identity.
    // Org installs require a separate GitHub user-access authorization and are not accepted here.
    if (linked.account.type !== "User" || linked.account.id !== githubId)
      throw new ApiError(
        403,
        "This GitHub installation is not on your linked personal account.",
      );
    const { error } = await adminClient().from("github_connections").upsert(
      {
        user_id: user.id,
        installation_id: id,
        account_login: linked.account.login,
        encrypted_token: null,
        token_expires_at: null,
      },
      { onConflict: "user_id,installation_id" },
    );
    if (error) throw new ApiError(502, "Couldn't save GitHub installation.");
    return NextResponse.redirect(
      new URL("/settings/account?github=connected", origin),
    );
  } catch {
    return NextResponse.redirect(
      new URL("/settings/account?github=setup-failed", origin),
    );
  }
}
