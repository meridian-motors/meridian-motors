import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import { publicEnv } from "@/lib/env";
import { CookieConsent } from "@/components/site/cookie-consent";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: { default: "Meridian Motors — A smarter way to buy and sell cars", template: "%s | Meridian Motors" },
  description: "Meridian Motors is a premium automotive marketplace. Discover quality used cars from verified private sellers, or sell your car faster with intelligent Fast Sale pricing.",
  applicationName: "Meridian Motors",
  openGraph: { type: "website", siteName: "Meridian Motors", locale: "en_GB" },
  twitter: { card: "summary_large_image" },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = { themeColor: "#0D0F10", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${manrope.variable}`}>
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
        {children}
        <CookieConsent />
      </body>
    </html>
  );
}
