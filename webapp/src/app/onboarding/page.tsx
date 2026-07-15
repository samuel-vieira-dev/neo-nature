"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import { ArrowRight, Bell, Camera, Check, Flame, Leaf, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { uploadPhoto } from "@/lib/photo";
import { ensurePushSubscription } from "@/lib/push";
import { CTA } from "@/components/ui";
import { productById } from "@/lib/data";
import { goals, habitAnchors, type Niche } from "@/lib/protocol";

const stepVariants = {
  enter: { opacity: 0 },
  center: { opacity: 1 },
  exit: { opacity: 0 },
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
    confetti({ particleCount: 60, spread: 65, origin: { y: 0.5 }, colors: ["#047857", "#34d399"] });
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
    router.push("/");
  };

  return (
    <div className="flex min-h-dvh flex-col px-6 pb-10 pt-10">
      {/* progress */}
      <div className="mb-6 flex justify-center gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-2 rounded-full transition-all duration-200"
            style={{
              width: step === i ? 24 : 8,
              backgroundColor: step >= i ? "var(--accent)" : "var(--border)",
            }}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* STEP 0 — welcome */}
        {step === 0 && (
          <motion.div key="s0" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="flex flex-1 flex-col justify-center text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-[var(--accent)]">
              <Leaf className="h-10 w-10 text-white" />
            </div>
            <h1 className="mt-6 font-display text-3xl font-extrabold leading-tight text-[var(--text)]">
              Welcome to <span className="text-[var(--accent)]">Neo Nature</span>
            </h1>
            <p className="mx-auto mt-3 max-w-64 text-base leading-relaxed text-muted">
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
          <motion.div key="s1" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
            <h2 className="font-display text-2xl font-bold text-[var(--text)]">What brings you here?</h2>
            <p className="mt-1 text-base text-muted">We&apos;ll tailor your setup around it.</p>
            <div className="mt-5 space-y-3">
              {goals.map((g) => (
                <button
                  key={g.niche}
                  onClick={() => setNiche(g.niche)}
                  className={`card w-full rounded-2xl p-4 text-left transition-all ${
                    niche === g.niche ? "ring-2 ring-[var(--accent)]" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{g.emoji}</span>
                    <div className="flex-1">
                      <p className="text-base font-bold text-[var(--text)]">{g.title}</p>
                      <p className="text-sm text-muted">{g.blurb}</p>
                    </div>
                    {niche === g.niche && <Check className="h-5 w-5 text-[var(--accent)]" />}
                  </div>
                </button>
              ))}
            </div>

            {niche && (
              <div className="mt-4">
                <label className="text-sm font-semibold text-muted">
                  What made you start today? <span className="text-muted">(we&apos;ll remind you when it matters)</span>
                </label>
                <textarea
                  value={motivation}
                  onChange={(e) => setMotivation(e.target.value)}
                  rows={2}
                  placeholder="e.g. I want to feel confident and full of energy again"
                  className="card mt-2 w-full resize-none rounded-2xl p-4 text-base placeholder:text-muted"
                />
                <div className="mt-4">
                  <CTA onClick={() => setStep(2)}>
                    Continue <ArrowRight className="h-4 w-4" />
                  </CTA>
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* STEP 2 — first dose */}
        {step === 2 && product && (
          <motion.div key="s2" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }} className="flex flex-1 flex-col">
            <h2 className="font-display text-2xl font-bold text-[var(--text)]">Day 1 starts now</h2>
            <p className="mt-1 text-base text-muted">
              People who take their first dose right away are far more likely to finish the bottle.
            </p>

            <div className="mt-6 flex flex-1 flex-col items-center justify-center">
              <AnimatePresence mode="wait">
                {firstDoseTaken ? (
                  <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
                    <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[var(--accent)]">
                      <Check className="h-12 w-12 text-white" strokeWidth={3} />
                    </div>
                    <p className="mt-4 font-display text-xl font-bold text-[var(--text)]">First dose logged!</p>
                    <p className="mt-1 text-sm text-muted">Your streak starts today.</p>
                  </motion.div>
                ) : (
                  <div className="w-full text-center">
                    <CTA onClick={takeFirstDose}>
                      <Flame className="h-5 w-5" fill="currentColor" /> I just took my first dose
                    </CTA>
                  </div>
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
                className={`card mt-6 flex min-h-[56px] w-full items-center justify-center gap-2 rounded-2xl border-dashed py-4 text-base ${
                  photoId ? "text-[var(--accent)]" : "text-muted"
                }`}
              >
                {photoId ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                {photoBusy ? "Uploading…" : photoId ? "Bottle photo saved" : "Snap your bottle (optional)"}
              </button>
            </div>

            <div className="mt-6 space-y-3">
              <CTA onClick={() => setStep(3)}>
                Continue <ArrowRight className="h-4 w-4" />
              </CTA>
              {!firstDoseTaken && (
                <button onClick={() => setStep(3)} className="w-full text-center text-sm text-muted">
                  I&apos;ll take it later today
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* STEP 3 — reminders + push */}
        {step === 3 && (
          <motion.div key="s3" variants={stepVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.2 }}>
            <h2 className="font-display text-2xl font-bold text-[var(--text)]">Never miss a dose</h2>
            <p className="mt-1 text-base text-muted">
              Anchor it to something you already do every day — that&apos;s how habits stick.
            </p>

            <div className="mt-5 space-y-3">
              {reminderList.map((r, i) => (
                <div key={i} className="card rounded-2xl p-4">
                  <div className="flex items-center gap-3">
                    <input
                      type="time"
                      value={r.time}
                      onChange={(e) =>
                        setReminderList((list) => list.map((x, xi) => (xi === i ? { ...x, time: e.target.value } : x)))
                      }
                      className="card w-28 rounded-xl px-2 py-2 text-center font-display text-lg font-bold"
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
                          className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${
                            r.habitAnchor === anchor ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-muted"
                          }`}
                        >
                          {anchor}
                        </button>
                      ))}
                    </div>
                    {reminderList.length > 1 && (
                      <button
                        onClick={() => setReminderList((list) => list.filter((_, xi) => xi !== i))}
                        className="shrink-0 text-muted"
                        aria-label="Remove reminder"
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
                  className="card flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border-dashed py-3 text-base text-muted"
                >
                  <Plus className="h-4 w-4" /> Add another reminder
                </button>
              )}
            </div>

            <div className="mt-6 space-y-3">
              <CTA onClick={() => finish(true)}>
                <Bell className="h-5 w-5" /> {busy ? "Setting up…" : "Enable reminders & finish"}
              </CTA>
              <button onClick={() => finish(false)} className="w-full text-center text-sm text-muted" disabled={busy}>
                Finish without push notifications
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
