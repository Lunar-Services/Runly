// Shared catalog contains no provider configuration or server credentials.
export type ProjectLanguage = "javascript" | "typescript" | "html" | "python";
export type ProjectTemplate = "empty" | "web";

export const projectLanguages: { id: ProjectLanguage; label: string }[] = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "html", label: "HTML & CSS" },
  { id: "python", label: "Python" },
];

export const projectTemplates: {
  id: ProjectTemplate | "video" | "image";
  name: string;
  description: string;
  languages: ProjectLanguage[];
  available: boolean;
}[] = [
  {
    id: "empty",
    name: "Empty",
    description: "A blank project with a README. Start with your own files.",
    languages: ["javascript", "typescript", "html", "python"],
    available: true,
  },
  {
    id: "web",
    name: "Web application",
    description: "A working website starter, ready to edit and preview.",
    languages: ["javascript", "typescript", "html"],
    available: true,
  },
  {
    id: "video",
    name: "Video editor",
    description: "Video editing projects are coming soon.",
    languages: [],
    available: false,
  },
  {
    id: "image",
    name: "Image editor",
    description: "Image editing projects are coming soon.",
    languages: [],
    available: false,
  },
];

export function supportsProjectTemplate(
  template: ProjectTemplate,
  language: ProjectLanguage,
) {
  return projectTemplates.some(
    (item) =>
      item.id === template &&
      item.available &&
      item.languages.includes(language),
  );
}

export type TemplateFile = { path: string; content: string };
export function projectTemplateFiles(
  template: ProjectTemplate,
  language: ProjectLanguage,
): TemplateFile[] {
  if (!supportsProjectTemplate(template, language))
    throw new Error("Choose a supported template and language.");
  const label = projectLanguages.find((item) => item.id === language)!.label;
  if (template === "empty")
    return [
      {
        path: "README.md",
        content: `# Your project\n\nSelected language: ${label}.\n\nThis is a blank project. Add your own source files and dependencies. No application or development server has been created.\n`,
      },
    ];
  const css = `* { box-sizing: border-box; }\nbody { margin: 0; background: #fafbfd; color: #151b26; font-family: system-ui, sans-serif; }\nmain { max-width: 860px; margin: 0 auto; padding: 100px 28px; }\nh1 { font-size: clamp(36px, 6vw, 64px); line-height: 1.08; letter-spacing: -.04em; margin: 20px 0; }\np { color: #576476; line-height: 1.65; }\na, button { color: inherit; }\nbutton { background: #151b26; color: white; border: 0; border-radius: 8px; padding: 14px 24px; font: inherit; cursor: pointer; }\nbutton:focus-visible { outline: 3px solid #64748b; outline-offset: 4px; }\n`;
  if (language === "html")
    return [
      {
        path: "README.md",
        content:
          "# Web application\n\nA dependency-free HTML, CSS, and JavaScript starter.\n\nRun `npm run dev` to serve the app on port 3000. Open Preview in Runly to view it.\n\nEdit `index.html`, `styles.css`, and `app.js`.\n",
      },
      {
        path: "package.json",
        content:
          JSON.stringify(
            {
              name: "runly-web-starter",
              private: true,
              version: "0.1.0",
              scripts: { dev: "node server.mjs", start: "node server.mjs" },
            },
            null,
            2,
          ) + "\n",
      },
      {
        path: "index.html",
        content:
          '<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your new website</title><link rel="stylesheet" href="/styles.css"><script src="/app.js" defer></script></head>\n<body><main><p>Your project starts here</p><h1>A little idea.<br>A new beginning.</h1><p>Edit this page to make it your own.</p><button id="hello" type="button">Try the button</button><p id="message" role="status"></p></main></body>\n</html>\n',
      },
      { path: "styles.css", content: css },
      {
        path: "app.js",
        content:
          'document.getElementById("hello").addEventListener("click", () => {\n  document.getElementById("message").textContent = "Your website is working. Make something you love.";\n});\n',
      },
      {
        path: "server.mjs",
        content:
          'import { createServer } from "node:http";\nimport { readFile } from "node:fs/promises";\nconst routes = new Map([["/", ["index.html", "text/html"]], ["/index.html", ["index.html", "text/html"]], ["/styles.css", ["styles.css", "text/css"]], ["/app.js", ["app.js", "text/javascript"]]]);\ncreateServer(async (request, response) => {\n  try {\n    const route = routes.get(new URL(request.url, "http://localhost").pathname);\n    if (!route || !["GET", "HEAD"].includes(request.method)) { response.writeHead(404); response.end("Not found"); return; }\n    const content = await readFile(new URL(route[0], import.meta.url));\n    response.writeHead(200, { "Content-Type": route[1] + "; charset=utf-8", "X-Content-Type-Options": "nosniff" });\n    response.end(request.method === "HEAD" ? undefined : content);\n  } catch { response.writeHead(500); response.end("Server error"); }\n}).listen(3000, "0.0.0.0", () => console.log("Website ready on port 3000"));\n',
      },
    ];
  const ts = language === "typescript";
  const files: TemplateFile[] = [
    {
      path: "README.md",
      content: `# Web application\n\nA Next.js App Router starter using ${label}.\n\nRun \`npm install\` and \`npm run dev\`. Open Preview in Runly to view the app.\n\nEdit \`app/page.${ts ? "tsx" : "jsx"}\` and \`app/globals.css\` to make it your own.\n`,
    },
    {
      path: "package.json",
      content:
        JSON.stringify(
          {
            name: "runly-web-starter",
            private: true,
            version: "0.1.0",
            scripts: {
              dev: "next dev",
              build: "next build",
              start: "next start",
            },
            dependencies: {
              next: "16.3.8",
              react: "19.2.8",
              "react-dom": "19.2.8",
            },
            ...(ts
              ? {
                  devDependencies: {
                    typescript: "^5",
                    "@types/node": "^22",
                    "@types/react": "^19",
                    "@types/react-dom": "^19",
                  },
                }
              : {}),
          },
          null,
          2,
        ) + "\n",
    },
    {
      path: `app/layout.${ts ? "tsx" : "jsx"}`,
      content: `${ts ? 'import type { ReactNode } from "react";\n' : ""}import "./globals.css";\nexport const metadata = { title: "Your new website", description: "A new project, made with Runly." };\nexport default function RootLayout({ children }${ts ? ": { children: ReactNode }" : ""}) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n`,
    },
    {
      path: `app/page.${ts ? "tsx" : "jsx"}`,
      content:
        '"use client";\nimport { useState } from "react";\nexport default function Home() {\n  const [message, setMessage] = useState("");\n  return <main><p>Your project starts here</p><h1>A little idea.<br />A new beginning.</h1><p>Edit this page to make it your own.</p><button type="button" onClick={() => setMessage("Your website is working. Make something you love.")}>Try the button</button><p role="status">{message}</p></main>;\n}\n',
    },
    { path: "app/globals.css", content: css },
  ];
  if (ts)
    files.push({
      path: "tsconfig.json",
      content:
        JSON.stringify(
          {
            compilerOptions: {
              target: "ES2017",
              lib: ["dom", "dom.iterable", "esnext"],
              allowJs: true,
              skipLibCheck: true,
              strict: true,
              noEmit: true,
              esModuleInterop: true,
              module: "esnext",
              moduleResolution: "bundler",
              resolveJsonModule: true,
              isolatedModules: true,
              jsx: "react-jsx",
              incremental: true,
              plugins: [{ name: "next" }],
            },
            include: [
              "next-env.d.ts",
              "**/*.ts",
              "**/*.tsx",
              ".next/types/**/*.ts",
              ".next/dev/types/**/*.ts",
            ],
            exclude: ["node_modules"],
          },
          null,
          2,
        ) + "\n",
    });
  return files;
}
