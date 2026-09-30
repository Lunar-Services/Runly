import type { Metadata } from "next";
import { MarketingPage } from "@/components/marketing-page";

export const metadata: Metadata = {
  title: "About us",
  description: "Meet LunarGroup, the company and people building Runly.",
};

export default function AboutPage() {
  return <MarketingPage searchParams={Promise.resolve({})} aboutPage />;
}
