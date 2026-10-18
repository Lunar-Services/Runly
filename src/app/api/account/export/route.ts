import { ApiError, failure, rateLimit, session } from "@/lib/api";

type ProjectMetadata = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function GET(request: Request) {
  try {
    const { db, user } = await session();
    await rateLimit(request, "account-export", user.id, 3);
    const { data: profile, error } = await db
      .from("profiles")
      .select(
        "display_name,full_name,notification_preferences,created_at,updated_at",
      )
      .eq("id", user.id)
      .single();
    if (error || !profile)
      throw new ApiError(
        502,
        "Couldn't prepare your account export. Try again.",
      );

    // Paginate past the REST row limit while bounding download memory and work.
    // Explicitly select public metadata: no project files, tokens, or credentials.
    const projects: ProjectMetadata[] = [];
    const pageSize = 500;
    for (let offset = 0; offset <= 10_000; offset += pageSize) {
      const { data, error: projectError } = await db
        .from("projects")
        .select("id,name,status,created_at,updated_at")
        .eq("owner_id", user.id)
        .order("id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (projectError)
        throw new ApiError(
          502,
          "Couldn't prepare your project metadata. Try again.",
        );
      if (projects.length + (data?.length || 0) > 10_000)
        throw new ApiError(413, "Your export is too large to download here.");
      projects.push(...((data || []) as ProjectMetadata[]));
      if (!data || data.length < pageSize) break;
    }
    const date = new Date();
    return Response.json(
      {
        version: 1,
        exportedAt: date.toISOString(),
        account: {
          id: user.id,
          email: user.email || "",
          joinedAt: user.created_at,
          displayName: profile.display_name || "",
          fullName: profile.full_name || "",
          preferences: profile.notification_preferences,
          profileCreatedAt: profile.created_at,
          profileUpdatedAt: profile.updated_at,
        },
        projects,
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="runly-account-${date.toISOString().slice(0, 10)}.json"`,
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    return failure(error);
  }
}
