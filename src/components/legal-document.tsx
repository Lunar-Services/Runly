import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Brand } from "./brand";

const documents = {
  terms: "terms-draft.txt",
  privacy: "privacy-policy.md",
  refund: "refund-policy.md",
};
function inline(text: string) {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) =>
      part.startsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}
export async function LegalDocument({
  kind,
}: {
  kind: keyof typeof documents;
}) {
  const source = await readFile(
    path.join(process.cwd(), "content", "legal", documents[kind]),
    "utf8",
  );
  const blocks = source.trim().split(/\r?\n\s*\r?\n/);
  return (
    <div className="legal-page">
      <header>
        <Brand />
        <Link href="/">Back home</Link>
      </header>
      <main>
        {kind === "terms" && (
          <div className="draft-banner">
            <AlertTriangle /> DRAFT FOR REVIEW — NOT YET PUBLISHED
          </div>
        )}
        <article className="legal-source">
          {blocks.map((block, index) => {
            if (/^(# |RUNLY —)/.test(block))
              return <h1 key={index}>{block.replace(/^(# |RUNLY — )/, "")}</h1>;
            if (/^## /.test(block))
              return <h2 key={index}>{block.slice(3)}</h2>;
            if (kind === "terms")
              return (
                <div key={index}>
                  {block
                    .split(/\r?\n/)
                    .map((line, lineIndex) =>
                      /^\d+\./.test(line) ? (
                        <h2 key={lineIndex}>{line}</h2>
                      ) : (
                        <p key={lineIndex}>{line}</p>
                      ),
                    )}
                </div>
              );
            return <p key={index}>{inline(block)}</p>;
          })}
        </article>
        <nav aria-label="Policies" className="legal-policy-links">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/refund">Refund Policy</Link>
        </nav>
      </main>
    </div>
  );
}
