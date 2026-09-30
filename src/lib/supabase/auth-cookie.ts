// The __Host- prefix keeps production auth bound to the app host.
export const authCookieOptions =
  process.env.NODE_ENV === "production"
    ? {
        name: "__Host-runly-auth",
        path: "/",
        secure: true,
        sameSite: "lax" as const,
      }
    : undefined;
