import Image from "next/image";
import Link from "next/link";

interface BrandProps {
  compact?: boolean;
  className?: string;
}

export function Brand({ compact = false, className = "" }: BrandProps) {
  return (
    <Link
      className={`brand ${className}`.trim()}
      href="/"
      aria-label="Runly AI home"
    >
      <span className="brand-mark">
        <Image
          src="/brand/runly-mark.png"
          alt="Runly logo"
          width={28}
          height={28}
          priority
        />
      </span>
      {!compact && <span className="brand-name">Runly</span>}
    </Link>
  );
}
