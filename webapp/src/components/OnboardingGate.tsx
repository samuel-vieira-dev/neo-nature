"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMe } from "@/lib/hooks";

/** Sends signed-in users who haven't finished onboarding to /onboarding */
export default function OnboardingGate() {
  const { data: me } = useMe();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (
      me &&
      !me.user.onboarded &&
      // an admin previewing a lead's account gets the real app, not onboarding
      !me.impersonating &&
      !pathname.startsWith("/onboarding") &&
      !pathname.startsWith("/login") &&
      !pathname.startsWith("/admin")
    ) {
      router.replace("/onboarding");
    }
  }, [me, pathname, router]);

  return null;
}
