"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Eye } from "lucide-react";

type Status = { impersonating: false } | { impersonating: true; customerName: string };

/** Shows while an admin is viewing the app as a customer (see /api/admin/impersonate). */
export default function ImpersonationBanner() {
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    fetch("/api/impersonation")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ impersonating: false }));
  }, [pathname]);

  if (!status?.impersonating) return null;

  const exit = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin");
  };

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-xs font-semibold text-white">
      <span className="flex items-center gap-1.5">
        <Eye className="h-3.5 w-3.5" />
        Viewing as {status.customerName}
      </span>
      <button onClick={exit} className="rounded bg-white/20 px-2 py-1 hover:bg-white/30">
        Exit
      </button>
    </div>
  );
}
