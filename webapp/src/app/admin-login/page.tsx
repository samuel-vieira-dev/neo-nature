"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { KeyRound, ArrowRight, ShieldCheck } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!password) return setError("Enter the admin password");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.status === 401) return setError("Wrong password — try again");
    if (!res.ok) return setError("Something went wrong — try again");
    router.push("/admin");
    router.refresh();
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 pb-16">
      <div className="text-center">
        <Image src="/logo.svg" alt="Neo Nature" width={200} height={33} priority className="mx-auto h-8 w-auto" />
        <p className="mt-3 flex items-center justify-center gap-1.5 text-sm font-bold text-[var(--accent)]">
          <ShieldCheck className="h-4 w-4" /> Admin panel
        </p>
      </div>

      <div className="mt-8 rounded-3xl border border-[var(--border)] bg-white p-5">
        <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
          <KeyRound className="h-4 w-4" /> Admin password
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="••••••••"
          autoFocus
          className="w-full min-h-[52px] rounded-2xl border border-[var(--border)] px-4 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
        />
        <button
          onClick={submit}
          className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] font-display text-base font-bold text-white"
        >
          {busy ? "Signing in…" : "Sign in"} <ArrowRight className="h-4 w-4" />
        </button>
        {error && <p className="mt-3 text-center text-sm text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
