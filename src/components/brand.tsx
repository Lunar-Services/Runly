import Image from "next/image";
import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="Runly AI home">
      <span className="brand-mark">
        <Image src="/brand/runly-mark.png" alt="" width={28} height={28} priority />
      </span>
      {!compact && <span>Runly</span>}
    </Link>
  );
}
