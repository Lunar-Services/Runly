import {
  ApiError,
  appOrigin,
  failure,
  rateLimit,
  sameOrigin,
  session,
} from "@/lib/api";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await session();
    await rateLimit(request, "github-link", user.id, 5);
    const { data: identities, error: identitiesError } =
      await db.auth.getUserIdentities();
    if (identitiesError)
      throw new ApiError(502, "Couldn't check linked accounts.");
    if (
      identities?.identities?.some((identity) => identity.provider === "github")
    )
      return Response.json({ linked: true });
    const { data, error } = await db.auth.linkIdentity({
      provider: "github",
      options: {
        redirectTo: `${appOrigin(request)}/auth/callback?next=/settings`,
      },
    });
    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes("manual") && message.includes("link"))
        throw new ApiError(
          503,
          "Enable manual identity linking in Supabase Auth settings, then try again.",
        );
      if (message.includes("provider") || message.includes("github"))
        throw new ApiError(
          503,
          "Enable the GitHub OAuth provider in Supabase Auth and verify its OAuth credentials.",
        );
      console.error("Supabase GitHub identity linking failed:", error.message);
      throw new ApiError(
        503,
        "Supabase couldn't start GitHub linking. Check the GitHub provider and manual-linking settings in Supabase Auth.",
      );
    }
    if (!data?.url)
      throw new ApiError(
        503,
        "Supabase did not return a GitHub authorization URL.",
      );
    return Response.json({ url: data.url });
  } catch (error) {
    return failure(error);
  }
}
