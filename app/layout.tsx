import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { OnboardingOverlay } from "@/components/onboarding-overlay";

export const metadata: Metadata = {
  title: "IP Creator Agent",
  description: "AI content operating system for knowledge-first KOCs."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <div className="page-shell">
          <SiteHeader />
          <OnboardingOverlay />
          <div className="workspace-main">{children}</div>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
