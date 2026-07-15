import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import BottomNav from "@/components/BottomNav";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Neo Nature — Your Daily Wellness Companion",
  description: "Track your orders, build your streak, and get the most out of every Neo Nature supplement.",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Neo Nature" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body className="font-sans antialiased">
        <Providers>
          <main className="relative z-10 mx-auto min-h-dvh w-full max-w-md pb-32">{children}</main>
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
