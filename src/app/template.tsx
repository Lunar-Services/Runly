"use client";
import { usePathname } from "next/navigation";

export default function Template({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return <div className="route-enter" key={path}>{children}</div>;
}
