"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Leaf, Mail, KeyRound, ArrowRight, Sparkles, FlaskConical } from "lucide-react";
import { CTA, FadeUp } from "@/components/ui";

const personas = [
  { id: "michael", name: "Michael", emoji: "💪", scenario: "Day 12 · renewal in 3 days · order in transit" },
  { id: "jessica", name: "Jessica", emoji: "✨", scenario: "Day 28 · results logged · bottle almost empty" },
  { id: "robert", name: "Robert", emoji: "🌿", scenario: "3 days inactive · rescue & win-back flows" },
] as const;

export default function LoginPage() {
  const router = useRouter();
  const demo = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [demoCode, setDemoCode] = useState<string | null>(null);
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
    setDemoCode(data.demoCode ?? null);
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

  const loginAsPersona = async (persona: string) => {
    setBusy(true);
    const res = await fetch("/api/auth/persona", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      setError("Persona not seeded yet — run npm run db:seed");
    }
  };

  return (
    <div className="flex min-h-dvh flex-col justify-center px-6 pb-16">
      {/* brand */}
      <FadeUp className="text-center">
        <div className="grad glow mx-auto flex h-16 w-16 items-center justify-center rounded-3xl">
          <Leaf className="h-8 w-8 text-emerald-950" />
        </div>
        <h1 className="mt-4 font-display text-3xl font-extrabold">
          Neo <span className="text-grad">Nature</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Your daily wellness companion</p>
      </FadeUp>

      {/* auth card */}
      <FadeUp delay={0.08} className="mt-8">
        <div className="glass-strong rounded-3xl p-5">
          <AnimatePresence mode="wait">
            {step === "email" ? (
              <motion.div key="email" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted">
                  <Mail className="h-3.5 w-3.5" /> Sign in with your email — no password needed
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && requestCode()}
                  placeholder="you@example.com"
                  className="glass w-full rounded-2xl px-4 py-3.5 text-sm placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
                />
                <div className="mt-3">
                  <CTA onClick={requestCode}>
                    {busy ? "Sending…" : "Send login code"} <ArrowRight className="h-4 w-4" />
                  </CTA>
                </div>
              </motion.div>
            ) : (
              <motion.div key="code" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted">
                  <KeyRound className="h-3.5 w-3.5" /> Enter the 6-digit code we sent to {email}
                </label>
                {demoCode && (
                  <p className="mb-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-center text-xs text-amber-200">
                    Demo mode — your code is <span className="font-mono text-base font-bold">{demoCode}</span>
                  </p>
                )}
                <input
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && verify()}
                  placeholder="••••••"
                  className="glass w-full rounded-2xl px-4 py-3.5 text-center font-mono text-2xl tracking-[0.4em] placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
                />
                <div className="mt-3">
                  <CTA onClick={verify}>{busy ? "Verifying…" : "Sign in"}</CTA>
                </div>
                <button onClick={() => setStep("email")} className="mt-3 w-full text-center text-xs text-muted">
                  Use a different email
                </button>
              </motion.div>
            )}
          </AnimatePresence>
          {error && <p className="mt-3 text-center text-xs text-rose-300">{error}</p>}
        </div>
      </FadeUp>

      {/* demo personas */}
      {demo && (
        <FadeUp delay={0.16} className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-amber-300" />
            <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Demo scenarios</p>
          </div>
          <div className="space-y-2.5">
            {personas.map((p, i) => (
              <motion.button
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.07 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => loginAsPersona(p.id)}
                className="glass flex w-full items-center gap-3 rounded-2xl p-4 text-left"
              >
                <span className="text-2xl">{p.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{p.name}</span>
                  <span className="block truncate text-[11px] text-muted">{p.scenario}</span>
                </span>
                <Sparkles className="h-4 w-4 shrink-0 text-emerald-300" />
              </motion.button>
            ))}
          </div>
        </FadeUp>
      )}
    </div>
  );
}
