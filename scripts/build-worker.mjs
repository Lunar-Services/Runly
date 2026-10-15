import { build } from "esbuild";
import { copyFile, mkdir } from "node:fs/promises";

await build({
  entryPoints: ["runtime/gateway.ts", "runtime/reconcile.ts"],
  outdir: "dist/runtime",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  // ws optionally loads native accelerators; its JS fallbacks work in this image.
  external: ["bufferutil", "utf-8-validate"],
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  logLevel: "info",
});
await mkdir("dist/runtime", { recursive: true });
await copyFile("runtime/bridge.py", "dist/runtime/bridge.py");
