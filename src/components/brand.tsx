import Image from "next/image";
import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="Runly AI home">
      <span className="brand-mark">
        <Image
          src="/brand/runly-logo.png"
          alt=""
          width={1312}
          height={1199}
          priority
        />
      </span>
      {!compact && <span className="brand-gradient">Runly</span>}
    </Link>
  );
}
