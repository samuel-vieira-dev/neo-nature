"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Phone, KeyRound, ArrowRight, ChevronDown } from "lucide-react";
import { CTA, FadeUp } from "@/components/ui";
import { countryOptions, flagEmoji, normalizePhone, type CountryCode, type CountryOption } from "@/lib/phone-format";

// The brand's main markets, pinned above the alphabetical world list. Named
// statically so the server render (Node ICU) and the first client render
// agree — the full Intl-named list only comes in after hydration.
const PINNED: CountryOption[] = (
  [
    ["US", "+1", "United States"],
    ["CA", "+1", "Canada"],
    ["GB", "+44", "United Kingdom"],
    ["AU", "+61", "Australia"],
  ] as const
).map(([iso, dial, name]) => ({ iso, dial, name, flag: flagEmoji(iso) }));

const subscribeNoop = () => () => {};
/** false during SSR/hydration, true once mounted — hydration-safe "is client" flag. */
const useMounted = () => useSyncExternalStore(subscribeNoop, () => true, () => false);

const CODE_LENGTH = 4;

const DEMO_EMAIL = "demo@neonature.com";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [countryCode, setCountryCode] = useState<CountryCode>("US");
  const [localNumber, setLocalNumber] = useState("");
  const [phoneE164, setPhoneE164] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Every country in the world (libphonenumber metadata + Intl names). Built
  // after mount: country names/sort order come from the browser's ICU, which
  // need not match the server's, so SSR only knows the pinned four.
  const mounted = useMounted();
  const countries = useMemo(() => (mounted ? countryOptions() : PINNED), [mounted]);
  const pinned = PINNED;
  const country = countries.find((c) => c.iso === countryCode) ?? pinned[0];

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

    const phone = normalizePhone(country.iso, localNumber);
    if (!phone) return setError(`That doesn't look like a valid ${country.name} number — check it and try again`);

    setBusy(true);
    const res = await fetch("/api/auth/request-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    const data = (await res.json().catch(() => ({}))) as { phone?: string; devCode?: string; error?: string; twilioCode?: number | null };
    setBusy(false);
    if (!res.ok) {
      if (data.error === "invalid_phone") return setError("That doesn't look like a valid phone number — check it and try again");
      if (data.error === "sms_failed") {
        return setError(
          data.twilioCode === 21211 || data.twilioCode === 21614
            ? "We couldn't text that number — double-check it (mobile numbers only)"
            : "We couldn't text that number right now — try again in a minute or contact support"
        );
      }
      return setError("Something went wrong — try again");
    }
    setPhoneE164(data.phone ?? phone);
    setDevCode(data.devCode ?? null);
    setCode("");
    setStep("code");
  };

  const verify = async () => {
    if (code.length < CODE_LENGTH) return setError(`Enter the ${CODE_LENGTH}-digit code`);
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
                  {/* Country picker: a compact "flag + dial" control with the
                      native <select> laid invisibly on top, so tapping opens the
                      phone's own picker listing every country by name. */}
                  <div className="relative shrink-0">
                    <div
                      aria-hidden
                      className="card flex min-h-[52px] items-center gap-1 rounded-2xl pl-3 pr-2 text-base font-semibold text-[var(--text)]"
                    >
                      <span className="text-xl leading-none">{country.flag}</span>
                      <span>{country.dial}</span>
                      <ChevronDown className="h-4 w-4 text-muted" />
                    </div>
                    <select
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value as CountryCode)}
                      aria-label="Country"
                      className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    >
                      <optgroup label="Popular">
                        {pinned.map((c) => (
                          <option key={`p-${c.iso}`} value={c.iso}>
                            {c.flag} {c.name} ({c.dial})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="All countries">
                        {countries.map((c) => (
                          <option key={c.iso} value={c.iso}>
                            {c.flag} {c.name} ({c.dial})
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </div>
                  <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={localNumber}
                    onChange={(e) => setLocalNumber(e.target.value.replace(/[^\d\s\-+()]/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && requestCode()}
                    placeholder={country.iso === "US" || country.iso === "CA" ? "(555) 123-4567" : "Phone number"}
                    className="card min-h-[52px] w-full flex-1 rounded-2xl px-4 text-base placeholder:text-muted"
                  />
                </div>
                <p className="mt-2 text-xs text-muted">
                  {country.name} · type it the way you&apos;d dial it locally
                </p>
                <div className="mt-3">
                  <CTA onClick={requestCode} disabled={busy}>
                    {busy ? "Sending…" : "Send login code"} <ArrowRight className="h-4 w-4" />
                  </CTA>
                </div>
              </motion.div>
            ) : (
              <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-muted">
                  <KeyRound className="h-4 w-4" /> Enter the {CODE_LENGTH}-digit code we texted to {phoneE164}
                </label>
                {devCode && (
                  <p className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
                    Your code is <span className="font-mono text-base font-bold">{devCode}</span>
                  </p>
                )}
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
                  onKeyDown={(e) => e.key === "Enter" && verify()}
                  placeholder={"•".repeat(CODE_LENGTH)}
                  className="card w-full min-h-[52px] rounded-2xl px-4 text-center font-mono text-2xl tracking-[0.5em] placeholder:text-muted"
                />
                <div className="mt-3">
                  <CTA onClick={verify} disabled={busy}>{busy ? "Verifying…" : "Sign in"}</CTA>
                </div>
                <button onClick={() => { setStep("phone"); setError(null); }} className="mt-3 w-full text-center text-sm text-muted">
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
