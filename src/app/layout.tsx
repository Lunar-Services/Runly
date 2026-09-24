import type { Metadata } from "next";
import "./globals.css";
import "./cats.css";
import "./interactions.css";
import "./themes.css";
import { cookies } from "next/headers";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: {
    default: "Runly — Turn Your Ideas Into Businesses With AI",
    template: "%s — Runly",
  },
  description: "Turn your ideas into real businesses with Runly. Use AI to create digital products, build your online presence, and bring your next big idea to life.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const darkTheme = (await cookies()).get("runly-theme")?.value === "dark";
  return (
    <html lang="en" data-theme={darkTheme ? "dark" : "light"}>
      <body><ThemeProvider initialDark={darkTheme}>{children}</ThemeProvider></body>
    </html>
  );
}
