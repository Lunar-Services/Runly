import { ApiError, failure, session } from "@/lib/api";
import { linkedGithubUserId } from "@/lib/github";
import { signTicket } from "@/lib/runtime/shared";

export async function GET() {
  try {
    const { db, user } = await session();
    if (!(await linkedGithubUserId(db)))
      throw new ApiError(403, "Link your GitHub account first.");
    const slug = process.env.GITHUB_APP_SLUG;
    const secret = process.env.RUNLY_RUNTIME_SECRET;
    if (!slug || !/^[a-z0-9-]+$/.test(slug) || !secret || secret.length < 32)
      throw new ApiError(503, "GitHub App installation is not configured.");
    const state = signTicket(
      {
        project: "github-install",
        user: user.id,
        gateway: "setup",
        exp: Date.now() + 10 * 60_000,
      },
      secret,
    );
    return Response.json(
      {
        url: `https://github.com/apps/${slug}/installations/new?state=${encodeURIComponent(state)}`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
