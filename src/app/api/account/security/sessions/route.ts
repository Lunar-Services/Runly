import { ApiError, failure, rateLimit, sameOrigin, session } from "@/lib/api";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await session();
    await rateLimit(request, "account-security-sessions", user.id, 4);
    const { error } = await db.auth.signOut({ scope: "others" });
    if (error)
      throw new ApiError(
        502,
        "Couldn't sign out your other sessions. Try again.",
      );
    return Response.json(
      { message: "Your other sessions have been signed out." },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
