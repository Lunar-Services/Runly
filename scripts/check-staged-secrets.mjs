import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

const worktree = process.argv.includes("--worktree");
const tracked = process.argv.includes("--tracked") || worktree;
const history = process.argv.includes("--history");
const browser = process.argv.includes("--browser");
const browserDirectory = process.argv[process.argv.indexOf("--browser") + 1];
function browserFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory()
      ? browserFiles(path)
      : entry.name.endsWith(".js")
        ? [{ path, content: readFileSync(path, "utf8") }]
        : [];
  });
}
const candidates = browser
  ? browserFiles(
      browserDirectory && !browserDirectory.startsWith("--")
        ? browserDirectory
        : ".next/static",
    )
  : history
    ? [
        {
          path: "reachable Git history",
          content: execFileSync(
            "git",
            [
              "log",
              "--all",
              "--format=",
              "--no-ext-diff",
              "-p",
              "--",
              ".",
              ":(exclude)pnpm-lock.yaml",
            ],
            { maxBuffer: 128 * 1024 * 1024 },
          ).toString("utf8"),
        },
      ]
    : tracked
      ? execFileSync("git", [
          "ls-files",
          "-z",
          ...(worktree ? ["--cached", "--others", "--exclude-standard"] : []),
        ])
          .toString("utf8")
          .split("\0")
          .filter((path) => path && existsSync(path))
          .map((path) => ({
            path,
            content: readFileSync(path).toString("utf8"),
          }))
      : [
          {
            path: "staged changes",
            content: execFileSync(
              "git",
              ["diff", "--cached", "--no-ext-diff", "--unified=0", "--", "."],
              { encoding: "utf8" },
            )
              .split(/\r?\n/)
              .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
              .join("\n"),
          },
        ];

const detectors = [
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{20,}/],
  [
    "GitHub token",
    /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  ],
  ["OpenAI API key", /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/],
  ["Stripe secret key", /sk_(?:live|test)_[A-Za-z0-9]{16,}/],
  [
    "private key",
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----\s+[A-Za-z0-9+/=]{40,}/,
  ],
  [
    "Supabase service-role JWT",
    /(?:SUPABASE_SERVICE_ROLE_KEY|service_role)[\s"':=]+eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i,
  ],
  [
    "generic API key",
    /(?:api[_-]?key|api[_-]?token|secret[_-]?key)[ \t"':=]+(?!\$\{|<|your[_-]?|example|changeme|replace[_-]?me|undefined|null)[A-Za-z0-9_-]{20,}/i,
  ],
];

const findings = [];
// Compare actual local secret values without printing or persisting those values.
const privateValues = browser
  ? [
      ...Object.entries(process.env),
      ...[".env.local", ".env.prod"]
        .filter(existsSync)
        .flatMap((path) =>
          Object.entries(parseEnv(readFileSync(path, "utf8"))),
        ),
    ].filter(
      ([key, value]) =>
        !key.startsWith("NEXT_PUBLIC_") &&
        /(?:KEY|SECRET|TOKEN|PASSWORD)$/.test(key) &&
        typeof value === "string" &&
        value.length >= 16,
    )
  : [];
for (const { path, content } of candidates) {
  for (const [name, pattern] of detectors) {
    if (pattern.test(content)) findings.push(`${name} in ${path}`);
  }
  for (const [key, value] of privateValues)
    if (content.includes(value)) findings.push(`${key} value in ${path}`);
}

if (findings.length > 0) {
  console.error(
    `Secret scan blocked: possible ${[...new Set(findings)].join(", ")} detected.`,
  );
  console.error(
    "Remove the secret, rotate it if it is real, and use environment variables instead.",
  );
  process.exit(1);
}

console.log(
  browser
    ? "Browser bundle secret scan passed."
    : history
      ? "Git history secret scan passed."
      : tracked
        ? "Tracked-file secret scan passed."
        : "Staged secret scan passed.",
);
