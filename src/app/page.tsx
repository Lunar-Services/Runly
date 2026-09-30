import { MarketingPage } from "@/components/marketing-page";

export default function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; plan?: string; months?: string }>;
}) {
  return <MarketingPage searchParams={searchParams} />;
}
