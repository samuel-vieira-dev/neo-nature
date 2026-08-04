"use client";

import { usePathname } from "next/navigation";
import InstallBanner from "@/components/InstallBanner";
import ImpersonationBanner from "@/components/ImpersonationBanner";

/** Constrains the customer app to a phone width; gives /admin a wide layout. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const admin = pathname.startsWith("/admin");
  return (
    <main className={`relative z-10 mx-auto min-h-dvh w-full ${admin ? "max-w-5xl" : "max-w-md pb-32"}`}>
      <ImpersonationBanner />
      <InstallBanner />
      {children}
    </main>
  );
}
