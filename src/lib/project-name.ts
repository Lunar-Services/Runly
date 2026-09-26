const PROJECT_TYPES = [
  "portfolio",
  "dashboard",
  "landing page",
  "store",
  "shop",
  "blog",
  "portal",
  "website",
  "web app",
  "app",
] as const;

const TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "for",
  "me",
  "my",
  "please",
  "the",
  "to",
]);

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) =>
      TITLE_STOP_WORDS.has(word)
        ? word
        : `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
    )
    .join(" ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

export function projectNameFromPrompt(prompt: string, now = new Date()) {
  const clean = prompt
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const type = PROJECT_TYPES.find((candidate) => clean.includes(candidate));
  const subjectMatch = clean.match(
    /\bfor\s+(?:my\s+|a\s+|an\s+|the\s+)?(.+?)(?:\s+(?:work|business|company|brand|practice))?$/,
  );
  const subject = subjectMatch?.[1]
    ?.replace(
      /\b(?:website|site|web app|app|portfolio|dashboard|store|shop|blog|portal)\b/g,
      "",
    )
    .trim();
  let candidate = subject && type ? `${subject} ${type}` : clean;
  candidate = candidate
    .replace(
      /^(?:can you |could you |please )?(?:build|create|make|design|start)(?: me)?\s+/,
      "",
    )
    .replace(/^(?:a|an|the)\s+/, "")
    .replace(/\b(?:for me|please)\b$/g, "")
    .trim();
  const words = candidate.split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length) return titleCase(words.join(" ")).slice(0, 80);
  const month = now.toLocaleString("en-US", { month: "short" });
  return `New Project ${month} ${now.getDate()}`;
}
