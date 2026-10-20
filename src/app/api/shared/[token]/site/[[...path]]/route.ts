import { ApiError, appOrigin, failure } from "@/lib/api";
import { sharedSnapshot } from "@/lib/project-sharing";
import { validWorkspacePath } from "@/lib/runtime/shared";
const contentTypes: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  json: "application/json",
  txt: "text/plain",
  svg: "image/svg+xml",
};
export async function GET(
  request: Request,
  context: { params: Promise<{ token: string; path?: string[] }> },
) {
  try {
    const { token, path } = await context.params;
    const filePath = path?.length ? path.join("/") : "index.html";
    if (!validWorkspacePath(filePath))
      throw new ApiError(404, "File not found.");
    const extension = filePath.split(".").pop()?.toLowerCase() || "";
    if (!contentTypes[extension])
      throw new ApiError(404, "This source file is not a static site asset.");
    const snapshot = await sharedSnapshot(token);
    const file = snapshot.version.files.find(
      (item) => item.path === filePath && item.kind === "file",
    );
    if (!file) throw new ApiError(404, "File not found.");
    let content = file.content;
    if (extension === "html") {
      // Scope file references to this immutable snapshot. The sandbox disallows
      // document-controlled bases, forms, network connections and navigation.
      const base = `https://snapshot.invalid/api/shared/${token}/site/${filePath}`;
      content = content.replace(
        /\b(src|href)\s*=\s*(["'])([^"']*)\2/gi,
        (original, attribute: string, quote: string, value: string) => {
          if (
            !value ||
            value.startsWith("#") ||
            /^(?:data:|https?:|mailto:)/i.test(value)
          )
            return original;
          try {
            const target = new URL(
              value.startsWith("/")
                ? `/api/shared/${token}/site${value}`
                : value,
              base,
            );
            if (!target.pathname.startsWith(`/api/shared/${token}/site/`))
              return `${attribute}=${quote}#${quote}`;
            return `${attribute}=${quote}${target.pathname}${target.search}${target.hash}${quote}`;
          } catch {
            return `${attribute}=${quote}#${quote}`;
          }
        },
      );
    }
    const assetSource = `${appOrigin(request)}/api/shared/${token}/site/`;
    return new Response(content, {
      headers: {
        "Content-Type": `${contentTypes[extension]}; charset=utf-8`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy": `sandbox allow-scripts; default-src 'none'; script-src ${assetSource} 'unsafe-inline'; style-src ${assetSource} 'unsafe-inline'; img-src ${assetSource} data:; font-src ${assetSource} data:; connect-src 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'`,
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
