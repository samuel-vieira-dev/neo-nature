"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Phone, KeyRound, ArrowRight } from "lucide-react";
import { CTA, FadeUp } from "@/components/ui";
import { normalizePhone } from "@/lib/phone-format";

const COUNTRIES = [
  { code: "US", flag: "🇺🇸", dial: "+1", label: "United States" },
  { code: "BR", flag: "🇧🇷", dial: "+55", label: "Brazil" },
  { code: "CA", flag: "🇨🇦", dial: "+1", label: "Canada" },
  { code: "GB", flag: "🇬🇧", dial: "+44", label: "United Kingdom" },
  { code: "AU", flag: "🇦🇺", dial: "+61", label: "Australia" },
  { code: "MX", flag: "🇲🇽", dial: "+52", label: "Mexico" },
  { code: "PT", flag: "🇵🇹", dial: "+351", label: "Portugal" },
  { code: "ES", flag: "🇪🇸", dial: "+34", label: "Spain" },
  { code: "DE", flag: "🇩🇪", dial: "+49", label: "Germany" },
  { code: "FR", flag: "🇫🇷", dial: "+33", label: "France" },
  { code: "IT", flag: "🇮🇹", dial: "+39", label: "Italy" },
  { code: "IN", flag: "🇮🇳", dial: "+91", label: "India" },
  { code: "AR", flag: "🇦🇷", dial: "+54", label: "Argentina" },
  { code: "CL", flag: "🇨🇱", dial: "+56", label: "Chile" },
  { code: "CO", flag: "🇨🇴", dial: "+57", label: "Colombia" },
];

const DEMO_EMAIL = "demo@neonature.com";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [countryCode, setCountryCode] = useState("US");
  const [localNumber, setLocalNumber] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const country = COUNTRIES.find((c) => c.code === countryCode) ?? COUNTRIES[0];

  const requestCode = async () => {
    setError(null);

    // hidden demo bypass: typing the exact demo email still signs straight in
    if (localNumber.trim().toLowerCase() === DEMO_EMAIL) {
      setBusy(true);
      const res = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: DEMO_EMAIL }),
      });
      setBusy(false);
      if (!res.ok) return setError("Couldn't sign in — try again");
      router.push("/");
      router.refresh();
      return;
    }

    const phone = normalizePhone(country.dial, localNumber);
    if (!phone) return setError("Enter a valid phone number");

    setBusy(true);
    const res = await fetch("/api/auth/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    setBusy(false);
    if (!res.ok) return setError("Something went wrong — try again");
    const data = await res.json();
    setPhoneE164(phone);
    setDevCode(data.devCode ?? null);
    setStep("code");
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneE164, code }),
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
        <Image src="/logo.svg" alt="Neo Nature" width={240} height={39} priority className="mx-auto h-10 w-auto" />
        <p className="mt-3 text-base text-muted">Your daily wellness companion</p>
      </FadeUp>

      {/* auth card */}
      <FadeUp delay={0.06} className="mt-8">
        <div className="card rounded-3xl p-5">
          <AnimatePresence mode="wait">
            {step === "phone" ? (
              <motion.div key="phone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
                  <Phone className="h-4 w-4" /> Sign in with your phone — we&apos;ll text you a code
                </label>
                <div className="flex gap-2">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    aria-label="Country code"
                    className="card min-h-[52px] shrink-0 rounded-2xl px-2 text-base"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.dial}
                      </option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={localNumber}
                    onChange={(e) => setLocalNumber(e.target.value.replace(/[^\d\s-]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && requestCode()}
                    placeholder="(555) 123-4567"
                    className="card min-h-[52px] w-full flex-1 rounded-2xl px-4 text-base placeholder:text-muted"
                  />
                </div>
                <div className="mt-3">
                  <CTA onClick={requestCode}>
                    {busy ? "Sending…" : "Send login code"} <ArrowRight className="h-4 w-4" />
                  </CTA>
                </div>
              </motion.div>
            ) : (
              <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
                  <KeyRound className="h-4 w-4" /> Enter the 6-digit code we texted to {phoneE164}
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
                <button onClick={() => setStep("phone")} className="mt-3 w-full text-center text-sm text-muted">
                  Use a different phone number
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
