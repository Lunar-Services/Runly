import { z } from "zod";
import {
  ApiError,
  auditAction,
  body,
  failure,
  rateLimit,
  sameOrigin,
  session,
} from "@/lib/api";

const noStore = { "Cache-Control": "no-store" };
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enroll") }).strict(),
  z
    .object({
      action: z.literal("verify"),
      factorId: z.string().uuid(),
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/),
    })
    .strict(),
  z
    .object({
      action: z.literal("remove"),
      factorId: z.string().uuid(),
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/)
        .optional(),
    })
    .strict(),
]);

export async function GET() {
  try {
    const { db, user } = await session();
    const [
      { data: identities, error: identityError },
      { data: factors, error: factorError },
    ] = await Promise.all([
      db.auth.getUserIdentities(),
      db.auth.mfa.listFactors(),
    ]);

    if (identityError || factorError)
      throw new ApiError(502, "Couldn't load your security settings.");

    return Response.json(
      {
        email: user.email ?? "",
        providers: Array.from(
          new Set(
            (identities?.identities ?? []).map((identity) => identity.provider),
          ),
        ),
        factors: (factors?.all ?? [])
          .filter((factor) => factor.factor_type === "totp")
          .map((factor) => ({
            id: factor.id,
            type: factor.factor_type,
            status: factor.status,
            friendlyName: factor.friendly_name ?? "Authenticator app",
            createdAt: factor.created_at,
          })),
        lastSignInAt: user.last_sign_in_at ?? null,
      },
      { headers: noStore },
    );
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const input = actionSchema.safeParse(await body(request, 2048));
    if (!input.success)
      throw new ApiError(400, "Check the authenticator code and try again.");
    const actionInput = input.data;
    const { db, user } = await session({
      allowMfaPending: actionInput.action === "verify",
    });
    await rateLimit(request, "account-security", user.id, 8);

    if (actionInput.action === "enroll") {
      const { data: factors, error: listError } =
        await db.auth.mfa.listFactors();
      if (listError)
        throw new ApiError(502, "Couldn't prepare authenticator setup.");

      // Only one pending TOTP setup is useful. Remove stale, unverified setup
      // records before creating a fresh QR code and secret.
      const pendingFactors = (factors?.all ?? []).filter(
        (factor) =>
          factor.factor_type === "totp" && factor.status === "unverified",
      );
      for (const factor of pendingFactors) {
        const { error } = await db.auth.mfa.unenroll({ factorId: factor.id });
        if (error)
          throw new ApiError(502, "Couldn't restart authenticator setup.");
      }

      const { data, error } = await db.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Runly authenticator",
        issuer: "Runly",
      });
      if (error || !data?.totp)
        throw new ApiError(502, "Couldn't start authenticator setup.");

      await auditAction(user.id, "account.mfa_enrollment_started", {
        factor_id: data.id,
      });
      return Response.json(
        {
          factor: { id: data.id, type: data.type },
          totp: data.totp,
          message:
            "Scan the QR code, then enter the six-digit code from your app.",
        },
        { headers: noStore },
      );
    }

    if (actionInput.action === "verify") {
      const factorId = actionInput.factorId;
      const code = actionInput.code;
      const { data: factors, error: listError } =
        await db.auth.mfa.listFactors();
      const factor = factors?.all.find(
        (entry) =>
          entry.id === factorId &&
          entry.factor_type === "totp" &&
          entry.status === "unverified",
      );
      if (listError || !factor)
        throw new ApiError(
          404,
          "That authenticator setup has expired. Start again.",
        );

      const { error } = await db.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (error)
        throw new ApiError(
          400,
          "That code couldn't be verified. Check it and try again.",
        );

      await auditAction(user.id, "account.mfa_enabled", {
        factor_id: factorId,
      });
      return Response.json(
        { message: "Two-step verification is on." },
        { headers: noStore },
      );
    }

    if (actionInput.action !== "remove")
      throw new ApiError(400, "Choose a valid authenticator action.");

    const factorId = actionInput.factorId;
    const code = actionInput.code;
    const { data: factors, error: listError } = await db.auth.mfa.listFactors();
    const factor = factors?.all.find(
      (entry) => entry.id === factorId && entry.factor_type === "totp",
    );
    if (listError || !factor)
      throw new ApiError(404, "That authenticator could not be found.");

    if (factor.status === "verified") {
      if (!code)
        throw new ApiError(
          400,
          "Enter a code from your authenticator to turn it off.",
        );
      const { error: verifyError } = await db.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code,
      });
      if (verifyError)
        throw new ApiError(
          400,
          "That code couldn't be verified. Check it and try again.",
        );
    }

    const { error } = await db.auth.mfa.unenroll({ factorId: factor.id });
    if (error)
      throw new ApiError(502, "Couldn't remove that authenticator. Try again.");

    await auditAction(user.id, "account.mfa_removed", { factor_id: factor.id });
    return Response.json(
      { message: "Authenticator removed." },
      { headers: noStore },
    );
  } catch (error) {
    return failure(error);
  }
}
