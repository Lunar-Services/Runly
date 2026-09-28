import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    // Only configured WebSocket origins may connect. Do not weaken CSP with *.
    const runtimeSources = (
      JSON.parse(process.env.RUNLY_RUNTIME_GATEWAYS || "[]") as {
        url: string;
      }[]
    )
      .map(({ url }) => {
        const parsed = new URL(url);
        if (
          !["ws:", "wss:"].includes(parsed.protocol) ||
          parsed.username ||
          parsed.password
        )
          throw new Error("Invalid runtime gateway URL");
        return parsed.origin;
      })
      .join(" ");
    const supabaseSources = [
      "https://*.supabase.co",
      ...(process.env.RUNLY_LOCAL_SUPABASE === "true"
        ? ["http://127.0.0.1:54321", "http://localhost:54321"]
        : []),
    ].join(" ");
    const scriptSource =
      process.env.NODE_ENV === "development"
        ? "'self' 'unsafe-inline' 'unsafe-eval'"
        : "'self' 'unsafe-inline'";
    const previewDomain = process.env.RUNLY_PREVIEW_DOMAIN;
    const previewSources =
      [
        ...(process.env.RUNLY_RUNTIME_MODE === "mock"
          ? ["http://127.0.0.1:*"]
          : []),
        ...(previewDomain ? [`https://*.${previewDomain}`] : []),
      ].join(" ") || "'none'";
    const headers = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(self)",
      },
      {
        key: "Content-Security-Policy",
        value: `default-src 'self'; script-src ${scriptSource}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${supabaseSources}; connect-src 'self' ${supabaseSources} ${runtimeSources}; font-src 'self'; frame-src ${previewSources}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`,
      },
    ];
    if (process.env.NODE_ENV === "production") {
      headers.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }
    return [{ source: "/(.*)", headers }];
  },
};

export default nextConfig;
