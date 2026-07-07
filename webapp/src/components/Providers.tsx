"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppProvider } from "@/lib/store";
import OnboardingGate from "@/components/OnboardingGate";

export default function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, retry: 1, refetchOnWindowFocus: false },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <AppProvider>
        <OnboardingGate />
        {children}
      </AppProvider>
    </QueryClientProvider>
  );
}
