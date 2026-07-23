"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Leaf, Mail, KeyRound, ArrowRight } from "lucide-react";
import { CTA, FadeUp } from "@/components/ui";

export default function LoginPage() {
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
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });
    setBusy(false);
    if (!res.ok) return setError("That code didn't match — try again");
    router.push("/");
    router.refresh();
  };

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 pb-16">
      {/* brand */}
      <FadeUp className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[var(--accent)]">
          <Leaf className="h-8 w-8 text-white" />
        </div>
        <h1 className="mt-4 font-display text-3xl font-extrabold text-[var(--text)]">
          Neo <span className="text-[var(--accent)]">Nature</span>
        </h1>
        <p className="mt-1 text-base text-muted">Your daily wellness companion</p>
      </FadeUp>

      {/* auth card */}
      <FadeUp delay={0.06} className="mt-8">
        <div className="card rounded-3xl p-5">
          <AnimatePresence mode="wait">
            {step === "email" ? (
              <motion.div key="email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
                  <Mail className="h-4 w-4" /> Sign in with your email — no password needed
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && requestCode()}
                  placeholder="you@example.com"
                  className="card w-full min-h-[52px] rounded-2xl px-4 text-base placeholder:text-muted"
                />
                <div className="mt-3">
                  <CTA onClick={requestCode}>
                    {busy ? "Sending…" : "Send login code"} <ArrowRight className="h-4 w-4" />
                  </CTA>
                </div>
              </motion.div>
            ) : (
              <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
                  <KeyRound className="h-4 w-4" /> Enter the 6-digit code we sent to {email}
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
                  className="card w-full min-h-[52px] rounded-2xl px-4 text-center font-mono text-2xl tracking-[0.4em] placeholder:text-muted"
                />
                <div className="mt-3">
                  <CTA onClick={verify}>{busy ? "Verifying…" : "Sign in"}</CTA>
                </div>
                <button onClick={() => setStep("email")} className="mt-3 w-full text-center text-sm text-muted">
                  Use a different email
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {error && <p className="mt-3 text-center text-sm text-rose-700">{error}</p>}
        </div>
      </FadeUp>
    </div>
  );
}
