"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { ArrowRight, Bell, Camera, Check, Flame, Leaf, Play, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { uploadPhoto } from "@/lib/photo";
import { ensurePushSubscription } from "@/lib/push";
import { CTA } from "@/components/ui";
import Bottle from "@/components/Bottle";
import { productById } from "@/lib/data";
import { goals, phases, habitAnchors, type Niche } from "@/lib/protocol";

const stepVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

type ReminderDraft = { time: string; habitAnchor: string | null };

export default function OnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState(0);
  const [niche, setNiche] = useState<Niche | null>(null);
  const [motivation, setMotivation] = useState("");
  const [firstDoseTaken, setFirstDoseTaken] = useState(false);
  const [photoId, setPhotoId] = useState<number | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [reminderList, setReminderList] = useState<ReminderDraft[]>([
    { time: "08:00", habitAnchor: habitAnchors[0] },
  ]);
  const [busy, setBusy] = useState(false);

  const goal = goals.find((g) => g.niche === niche) ?? null;
  const product = goal ? productById(goal.productId) : null;

  const takeFirstDose = () => {
    setFirstDoseTaken(true);
    confetti({ particleCount: 120, spread: 85, origin: { y: 0.5 }, colors: ["#10b981", "#a3e635", "#fbbf24"] });
  };

  const onPhotoPicked = async (file: File | null) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const id = await uploadPhoto(file, "first_dose");
      setPhotoId(id);
      toast("Bottle photo saved 📸");
    } catch {
      toast("Couldn't upload the photo — you can skip it");
    } finally {
      setPhotoBusy(false);
    }
  };

  const finish = async (pushOptIn: boolean) => {
    if (!goal || !product) return;
    setBusy(true);

    if (pushOptIn) {
      await ensurePushSubscription().catch(() => "unsupported");
    }

    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        niche: goal.niche,
        motivation,
        productId: product.id,
        firstDoseTaken,
        reminders: reminderList,
        photoId: photoId ?? undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      toast("Something went wrong — try again");
      return;
    }
    await qc.invalidateQueries();
    confetti({ particleCount: 150, spread: 100, origin: { y: 0.4 }, colors: ["#10b981", "#a3e635"] });
    router.push("/");
  };

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-10 pt-10">
      {/* progress */}
      <div className="mb-6 flex justify-center gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <motion.span
            key={i}
            animate={{ width: step === i ? 24 : 8, backgroundColor: step >= i ? "#10b981" : "rgba(255,255,255,0.12)" }}
            className="h-2 rounded-full"
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* STEP 0 — welcome */}
        {step === 0 && (
          <motion.div key="s0" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="flex flex-1 flex-col justify-center text-center">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 220, damping: 16 }}
              className="grad glow mx-auto flex h-20 w-20 items-center justify-center rounded-3xl"
            >
              <Leaf className="h-10 w-10 text-emerald-950" />
            </motion.div>
            <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight">
              Welcome to <span className="text-grad">Neo Nature</span>
            </h1>
            <p className="mx-auto mt-3 max-w-64 text-sm leading-relaxed text-muted">
              Two minutes of setup, and we&apos;ll make sure this is the supplement that finally works — because you&apos;ll actually take it.
            </p>
            <div className="mt-8">
              <CTA onClick={() => setStep(1)}>
                Let&apos;s go <ArrowRight className="h-4 w-4" />
              </CTA>
            </div>
          </motion.div>
        )}

        {/* STEP 1 — goal + motivation */}
        {step === 1 && (
          <motion.div key="s1" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
            <h2 className="font-display text-2xl font-bold">What brings you here?</h2>
            <p className="mt-1 text-sm text-muted">We&apos;ll tailor your protocol around it.</p>
            <div className="mt-5 space-y-3">
              {goals.map((g) => (
                <button
                  key={g.niche}
                  onClick={() => setNiche(g.niche)}
                  className={`glass w-full rounded-2xl p-4 text-left transition-all ${
                    niche === g.niche ? "border-emerald-400/50 ring-1 ring-emerald-400/40" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{g.emoji}</span>
                    <div className="flex-1">
                      <p className="text-sm font-bold">{g.title}</p>
                      <p className="text-[11px] text-muted">{g.blurb}</p>
                    </div>
                    {niche === g.niche && <Check className="h-5 w-5 text-emerald-300" />}
                  </div>
                </button>
              ))}
            </div>

            {niche && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
                <label className="text-xs font-semibold text-muted">
                  What made you start today? <span className="text-white/30">(we&apos;ll remind you when it matters)</span>
                </label>
                <textarea
                  value={motivation}
                  onChange={(e) => setMotivation(e.target.value)}
                  rows={2}
                  placeholder="e.g. I want to feel confident and full of energy again"
                  className="glass mt-2 w-full resize-none rounded-2xl p-4 text-sm placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
                />
                <div className="mt-4">
                  <CTA onClick={() => setStep(2)}>
                    Continue <ArrowRight className="h-4 w-4" />
                  </CTA>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}

        {/* STEP 2 — protocol preview + posology */}
        {step === 2 && product && (
          <motion.div key="s2" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
            <h2 className="font-display text-2xl font-bold">Your 90-day protocol</h2>
            <p className="mt-1 text-sm text-muted">Built around {product.name} — {product.tagline.toLowerCase()}.</p>

            <div className="glass-strong relative mt-4 overflow-hidden rounded-3xl p-5 text-center">
              <div
                className="absolute inset-x-0 top-0 h-32 opacity-30"
                style={{ background: `radial-gradient(circle at 50% -20%, ${product.accent}, transparent 72%)` }}
              />
              <Bottle accent={product.accent} label={product.short} className="mx-auto h-32" />
              <p className="mt-2 font-display text-lg font-bold">{product.name}</p>
              <p className="text-[11px] text-muted">
                {product.dosePerDay} capsule{product.dosePerDay > 1 ? "s" : ""} a day · {Math.floor(product.capsules / product.dosePerDay)}-day supply
              </p>
            </div>

            {/* how to take it */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => toast("Demo: 30-second posology video plays here in Phase 2 ▶️")}
              className="glass mt-3 flex w-full items-center gap-3 rounded-2xl p-4"
            >
              <span className="grad flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
                <Play className="ml-0.5 h-4 w-4 text-emerald-950" fill="currentColor" />
              </span>
              <span className="text-left">
                <span className="block text-sm font-bold">How to take it — 30 sec</span>
                <span className="block text-[11px] text-muted">Dosage, timing and what to pair it with</span>
              </span>
            </motion.button>

            {/* phases */}
            <div className="mt-4 space-y-2.5">
              {phases.map((ph) => (
                <div key={ph.n} className="glass flex items-center gap-3 rounded-2xl p-3.5">
                  <span className="grad flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold text-emerald-950">
                    {ph.n}
                  </span>
                  <div>
                    <p className="text-sm font-bold">
                      {ph.name} <span className="text-[10px] font-semibold text-muted">· days {ph.fromDay}–{ph.toDay}</span>
                    </p>
                    <p className="text-[11px] text-muted">{ph.focus}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <CTA onClick={() => setStep(3)}>
                Continue <ArrowRight className="h-4 w-4" />
              </CTA>
            </div>
          </motion.div>
        )}

        {/* STEP 3 — first dose */}
        {step === 3 && product && (
          <motion.div key="s3" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }} className="flex flex-1 flex-col">
            <h2 className="font-display text-2xl font-bold">Day 1 starts now</h2>
            <p className="mt-1 text-sm text-muted">
              People who take their first dose right away are 3× more likely to finish the bottle.
            </p>

            <div className="mt-6 flex flex-1 flex-col items-center justify-center">
              <AnimatePresence mode="wait">
                {firstDoseTaken ? (
                  <motion.div key="done" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
                    <div className="grad glow mx-auto flex h-24 w-24 items-center justify-center rounded-full">
                      <Check className="h-12 w-12 text-emerald-950" strokeWidth={3} />
                    </div>
                    <p className="mt-4 font-display text-xl font-bold">First dose logged! 🎉</p>
                    <p className="mt-1 text-xs text-muted">Your streak starts today.</p>
                  </motion.div>
                ) : (
                  <motion.div key="cta" exit={{ scale: 0.9, opacity: 0 }} className="w-full text-center">
                    <CTA onClick={takeFirstDose}>
                      <Flame className="h-5 w-5" fill="currentColor" /> I just took my first dose
                    </CTA>
                  </motion.div>
                )}
              </AnimatePresence>

              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => onPhotoPicked(e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => fileRef.current?.click()}
                className={`glass mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border-dashed py-4 text-sm ${
                  photoId ? "text-emerald-300" : "text-muted"
                }`}
              >
                {photoId ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                {photoBusy ? "Uploading…" : photoId ? "Bottle photo saved" : "Snap your bottle (optional)"}
              </button>
            </div>

            <div className="mt-6 space-y-3">
              <CTA onClick={() => setStep(4)}>
                Continue <ArrowRight className="h-4 w-4" />
              </CTA>
              {!firstDoseTaken && (
                <button onClick={() => setStep(4)} className="w-full text-center text-xs text-muted">
                  I&apos;ll take it later today
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* STEP 4 — reminders + push */}
        {step === 4 && (
          <motion.div key="s4" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
            <h2 className="font-display text-2xl font-bold">Never miss a dose</h2>
            <p className="mt-1 text-sm text-muted">
              Anchor it to something you already do every day — that&apos;s how habits stick.
            </p>

            <div className="mt-5 space-y-3">
              {reminderList.map((r, i) => (
                <div key={i} className="glass rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      value={r.time}
                      onChange={(e) =>
                        setReminderList((list) => list.map((x, xi) => (xi === i ? { ...x, time: e.target.value } : x)))
                      }
                      className="glass w-28 rounded-xl px-2 py-2 text-center font-display text-lg font-bold focus:outline-none"
                    />
                    <div className="no-scrollbar flex flex-1 gap-1.5 overflow-x-auto">
                      {habitAnchors.map((anchor) => (
                        <button
                          key={anchor}
                          onClick={() =>
                            setReminderList((list) =>
                              list.map((x, xi) => (xi === i ? { ...x, habitAnchor: anchor } : x))
                            )
                          }
                          className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold ${
                            r.habitAnchor === anchor ? "grad text-emerald-950" : "bg-white/6 text-muted"
                          }`}
                        >
                          {anchor}
                        </button>
                      ))}
                    </div>
                    {reminderList.length > 1 && (
                      <button
                        onClick={() => setReminderList((list) => list.filter((_, xi) => xi !== i))}
                        className="shrink-0 text-white/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {reminderList.length < 3 && (
                <button
                  onClick={() => setReminderList((list) => [...list, { time: "20:00", habitAnchor: null }])}
                  className="glass flex w-full items-center justify-center gap-2 rounded-2xl border-dashed py-3 text-sm text-muted"
                >
                  <Plus className="h-4 w-4" /> Add another reminder
                </button>
              )}
            </div>

            <div className="mt-6 space-y-3">
              <CTA onClick={() => finish(true)}>
                <Bell className="h-5 w-5" /> {busy ? "Setting up…" : "Enable reminders & finish"}
              </CTA>
              <button onClick={() => finish(false)} className="w-full text-center text-xs text-muted" disabled={busy}>
                Finish without push notifications
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
