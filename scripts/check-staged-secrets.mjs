import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const tracked = process.argv.includes("--tracked");
const candidates = tracked
  ? execFileSync("git", ["ls-files", "-z"])
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map((path) => ({ path, content: readFileSync(path).toString("utf8") }))
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
for (const { path, content } of candidates) {
  for (const [name, pattern] of detectors) {
    if (pattern.test(content)) findings.push(`${name} in ${path}`);
  }
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
  tracked ? "Tracked-file secret scan passed." : "Staged secret scan passed.",
);
