import { execFileSync } from "node:child_process";

const diff = execFileSync(
  "git",
  ["diff", "--cached", "--no-ext-diff", "--unified=0", "--", "."],
  { encoding: "utf8" },
);

const detectors = [
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  ["GitHub token", /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ["OpenAI API key", /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/],
  ["Stripe secret key", /sk_(?:live|test)_[A-Za-z0-9]{16,}/],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Supabase service-role JWT", /(?:SUPABASE_SERVICE_ROLE_KEY|service_role)[\s"':=]+eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/i],
  ["generic API key", /(?:api[_-]?key|api[_-]?token|secret[_-]?key)[\s"':=]+(?!\$\{|<|your[_-]?|example|changeme|replace[_-]?me|undefined|null)[A-Za-z0-9_-]{20,}/i],
];

const findings = [];
for (const line of diff.split(/\r?\n/)) {
  if (!line.startsWith("+") || line.startsWith("+++")) continue;
  for (const [name, pattern] of detectors) {
    if (pattern.test(line)) findings.push(name);
  }
}

if (findings.length > 0) {
  console.error(`Commit blocked: possible ${[...new Set(findings)].join(", ")} detected in staged changes.`);
  console.error("Remove the secret, rotate it if it is real, and use environment variables instead.");
  process.exit(1);
}

console.log("Secret scan passed.");
