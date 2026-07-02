import type { Metadata, Viewport } from "next";
import { Outfit, Inter } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import BottomNav from "@/components/BottomNav";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Neo Nature — Your Daily Wellness Companion",
  description: "Track your orders, build your streak, and get the most out of every Neo Nature supplement.",
  manifest: "/manifest.json",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Neo Nature" },
};

export const viewport: Viewport = {
  themeColor: "#070c0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${outfit.variable} ${inter.variable}`}>
      <body className="font-sans antialiased">
        {/* ambient brand glow */}
        <div className="orb h-72 w-72 bg-emerald-500" style={{ top: "-6rem", left: "-6rem" }} />
        <div className="orb h-80 w-80 bg-lime-400" style={{ bottom: "-8rem", right: "-8rem", animationDelay: "-8s" }} />
        <div className="orb h-56 w-56 bg-teal-500" style={{ top: "40%", right: "-6rem", animationDelay: "-4s", opacity: 0.14 }} />

        <AppProvider>
          <main className="relative z-10 mx-auto min-h-dvh w-full max-w-md pb-32">{children}</main>
          <BottomNav />
        </AppProvider>
      </body>
    </html>
  );
}
