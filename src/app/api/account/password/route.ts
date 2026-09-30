import { z } from "zod";
import {
  ApiError,
  body,
  failure,
  rateLimit,
  sameOrigin,
  session,
} from "@/lib/api";

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const { db, user } = await session();
    await rateLimit(request, "account-password", user.id, 5);
    const input = z
      .object({ password: z.string().min(8).max(128) })
      .safeParse(await body(request, 2048));
    if (!input.success)
      throw new ApiError(400, "Use a password between 8 and 128 characters.");
    const { error } = await db.auth.updateUser({
      password: input.data.password,
    });
    if (error)
      throw new ApiError(
        400,
        "Couldn't set password. If reauthentication is required, sign in again and retry.",
      );
    return Response.json({
      message:
        "Email password is ready. You can now sign in with either method.",
    });
  } catch (error) {
    return failure(error);
  }
}
