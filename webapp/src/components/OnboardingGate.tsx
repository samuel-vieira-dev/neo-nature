"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMe } from "@/lib/hooks";

/**
 * Sends signed-in users who haven't finished onboarding to /onboarding.
 * Customers still waiting for their first package only do the lightweight
 * pre-arrival setup there (awaitingDelivery) and are then let into the app;
 * the full onboarding waits until they have the bottle in hand.
 */
export default function OnboardingGate() {
  const { data: me } = useMe();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (
      me &&
      !me.user.onboarded &&
      !me.user.awaitingDelivery &&
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
