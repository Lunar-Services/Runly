import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Brand } from "./brand";

export async function LegalDocument({ kind }: { kind: "terms" | "privacy" }) {
  const file = kind === "terms" ? "terms-draft.txt" : "privacy-draft.txt";
  const source = await readFile(path.join(process.cwd(), "content", "legal", file), "utf8");
  const lines = source.split(/\r?\n/);
  return <div className="legal-page"><header><Brand /><Link href="/">Back home</Link></header><main>
    <div className="draft-banner"><AlertTriangle /> DRAFT FOR REVIEW — NOT YET PUBLISHED</div>
    <article className="legal-source">{lines.map((line, index) => {
      if (/^RUNLY —/.test(line)) return <h1 key={index}>{line.replace("RUNLY — ", "")}</h1>;
      if (/^\d+\./.test(line)) return <h2 key={index}>{line}</h2>;
      if (!line.trim()) return <br key={index} />;
      if (/^(DRAFT|Effective date:|Data controller|Privacy contact|Business address|Service operator|Contact email|Governing law)/.test(line)) return <p className="legal-meta" key={index}>{line}</p>;
      return <p key={index}>{line}</p>;
    })}</article>
  </main></div>;
}
