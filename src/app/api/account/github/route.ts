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
        redirectTo: `${appOrigin(request)}/auth/callback?next=/settings/account`,
      },
    });
    if (error || !data?.url)
      throw new ApiError(
        503,
        "GitHub linking is unavailable. Enable manual identity linking and GitHub OAuth in Supabase.",
      );
    return Response.json({ url: data.url });
  } catch (error) {
    return failure(error);
  }
}
