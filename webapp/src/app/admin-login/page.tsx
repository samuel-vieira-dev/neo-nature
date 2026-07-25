"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Mail, KeyRound, ArrowRight, ShieldCheck } from "lucide-react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCode = async () => {
    if (!email.includes("@")) return setError("Enter a valid email address");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    if (!res.ok) return setError("Something went wrong — try again");
    const data = await res.json();
    setDevCode(data.devCode ?? null);
    setStep("code");
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/admin-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    setBusy(false);
    if (res.status === 403) return setError("This email isn't an admin.");
    if (!res.ok) return setError("That code didn't match — try again");
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
        {step === "email" ? (
          <>
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
              <Mail className="h-4 w-4" /> Sign in with your admin email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && requestCode()}
              placeholder="admin@neonature.com"
              className="w-full min-h-[52px] rounded-2xl border border-[var(--border)] px-4 text-base focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <button
              onClick={requestCode}
              className="mt-3 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] font-display text-base font-bold text-white"
            >
              {busy ? "Sending…" : "Send login code"} <ArrowRight className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
              <KeyRound className="h-4 w-4" /> Enter the code sent to {email}
            </label>
            {devCode && (
              <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
                Your code is <span className="font-mono text-base font-bold">{devCode}</span>
              </p>
            )}
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(e) => e.key === "Enter" && verify()}
              placeholder="••••••"
              className="w-full min-h-[52px] rounded-2xl border border-[var(--border)] px-4 text-center font-mono text-2xl tracking-[0.4em] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <button
              onClick={verify}
              className="mt-3 flex min-h-[52px] w-full items-center justify-center rounded-2xl bg-[var(--accent)] font-display text-base font-bold text-white"
            >
              {busy ? "Verifying…" : "Sign in"}
            </button>
            <button onClick={() => setStep("email")} className="mt-3 w-full text-center text-sm text-muted">
              Use a different email
            </button>
          </>
        )}
        {error && <p className="mt-3 text-center text-sm text-rose-700">{error}</p>}
      </div>
    </div>
  );
}
