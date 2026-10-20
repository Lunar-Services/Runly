import { failure } from "@/lib/api";
import { sharedSnapshot } from "@/lib/project-sharing";
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    return Response.json(await sharedSnapshot(token, true), {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
