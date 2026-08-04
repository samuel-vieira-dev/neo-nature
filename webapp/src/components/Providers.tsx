"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProvider } from "@/lib/store";
import OnboardingGate from "@/components/OnboardingGate";
import { registerServiceWorker } from "@/lib/pwa";

export default function Providers({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
        },
      })
  );

  useEffect(() => {
    if (!pathname.startsWith("/admin")) registerServiceWorker();
  }, [pathname]);

  return (
    <QueryClientProvider client={client}>
      <AppProvider>
        <OnboardingGate />
        {children}
      </AppProvider>
    </QueryClientProvider>
  );
}
