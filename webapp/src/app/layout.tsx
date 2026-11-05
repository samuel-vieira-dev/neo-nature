import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import BottomNav from "@/components/BottomNav";
import AppShell from "@/components/AppShell";
import Clarity from "@/components/Clarity";
import StylesheetGuard from "@/components/StylesheetGuard";
import { THEME_COLORS, THEME_SCRIPT } from "@/lib/theme-script";
import InlineScript from "@/components/InlineScript";
import { ThemeSync } from "@/components/ThemeControls";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Neo Nature — Your Daily Wellness Companion",
  description: "Track your orders, build your streak, and get the most out of every Neo Nature supplement.",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg", shortcut: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Neo Nature" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-theme is set by THEME_SCRIPT before paint (light is the CSS default), hence suppressHydrationWarning.
    <html lang="en" className={`${outfit.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <InlineScript html={THEME_SCRIPT} />
      </head>
      <body className="font-sans antialiased">
        <StylesheetGuard />
        <ThemeSync />
        <Providers>
          <AppShell>{children}</AppShell>
          <BottomNav />
        </Providers>
        <Clarity />
      </body>
    </html>
  );
}
