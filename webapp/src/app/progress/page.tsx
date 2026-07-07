"use client";

import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  Camera,
  Check,
  Flame,
  Lock,
  Megaphone,
  PartyPopper,
  Plus,
  Ruler,
  Scale,
  Sparkles,
  Droplets,
  Trophy,
} from "lucide-react";
import Image from "next/image";
import { useApp } from "@/lib/store";
import { useMe, useResults, useLogResult, useSubmitTestimonial, type ResultEntry } from "@/lib/hooks";
import { uploadPhoto } from "@/lib/photo";
import { FadeUp } from "@/components/ui";
import TrendChart from "@/components/TrendChart";

const victoryChips = [
  "Clothes fit better",
  "Less bloating",
  "More energy",
  "Slept great",
  "Fewer cravings",
  "Better mood",
];

const shortDay = (iso: string) =>
  new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function ProgressPage() {
  const { toast } = useApp();
  const { data: me } = useMe();
  const { data: resultsData } = useResults();
  const logResult = useLogResult();
  const submitTestimonial = useSubmitTestimonial();
  const fileRef = useRef<HTMLInputElement>(null);

  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [glucoseAm, setGlucoseAm] = useState("");
  const [glucosePm, setGlucosePm] = useState("");
  const [edScore, setEdScore] = useState<number | null>(null);
  const [pendingPhotoId, setPendingPhotoId] = useState<number | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [victoryText, setVictoryText] = useState("");
  const [showTestimonial, setShowTestimonial] = useState(false);
  const [testimonialText, setTestimonialText] = useState("");
  const [consent, setConsent] = useState(false);

  const niche = me?.user.niche ?? "weight_loss";
  const entries = useMemo(() => resultsData?.entries ?? [], [resultsData]);
  const byType = (t: ResultEntry["type"]) => entries.filter((e) => e.type === t && e.valueNum !== null);
  const victories = entries.filter((e) => e.type === "victory");

  const primaryType: ResultEntry["type"] =
    niche === "diabetes" ? "glucose_am" : niche === "mens_health" ? "ed_score" : "weight";
  const primarySeries = byType(primaryType);
  const goodDirection = primaryType === "ed_score" ? "up" : "down";

  const protocolDay = me?.protocol?.day ?? 0;
  const day30Ready = protocolDay >= 30 && primarySeries.length >= 2;
  const firstEntry = primarySeries[0];
  const lastEntry = primarySeries[primarySeries.length - 1];
  const firstPhoto = entries.find((e) => e.photoId)?.photoId ?? null;
  const lastPhoto = [...entries].reverse().find((e) => e.photoId)?.photoId ?? null;

  const improving =
    primarySeries.length >= 2 &&
    (goodDirection === "down"
      ? lastEntry.valueNum! < firstEntry.valueNum!
      : lastEntry.valueNum! > firstEntry.valueNum!);

  const celebrate = (msg: string) => {
    confetti({ particleCount: 70, spread: 70, origin: { y: 0.5 }, colors: ["#10b981", "#a3e635", "#fbbf24"] });
    toast(msg);
  };

  const saveNumber = (type: ResultEntry["type"], raw: string, unit: string, clear: () => void) => {
    const value = parseFloat(raw);
    if (Number.isNaN(value) || value <= 0) return toast("Enter a valid number first");
    logResult.mutate(
      { type, valueNum: value, photoId: pendingPhotoId ?? undefined },
      {
        onSuccess: () => {
          celebrate(`${value}${unit} logged · +5 points ✨`);
          clear();
          setPendingPhotoId(null);
        },
      }
    );
  };

  const saveVictory = (text: string) => {
    logResult.mutate(
      { type: "victory", valueText: text },
      { onSuccess: () => celebrate("Victory logged! These count more than the scale 🏆") }
    );
    setVictoryText("");
  };

  const onPhotoPicked = async (file: File | null) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const id = await uploadPhoto(file, "progress");
      setPendingPhotoId(id);
      toast("Photo attached — it'll save with your next log 📸");
    } catch {
      toast("Couldn't upload the photo");
    } finally {
      setPhotoBusy(false);
    }
  };

  const sendTestimonial = () => {
    if (testimonialText.trim().length < 10) return toast("Tell us a bit more (10+ characters)");
    submitTestimonial.mutate(
      { text: testimonialText.trim(), consent, photoId: lastPhoto ?? undefined },
      {
        onSuccess: () => {
          setShowTestimonial(false);
          setTestimonialText("");
          confetti({ particleCount: 120, spread: 90, origin: { y: 0.4 }, colors: ["#10b981", "#a3e635"] });
          toast("Thank you for sharing! +50 points 💚");
        },
      }
    );
  };

  return (
    <div className="pt-8">
      <FadeUp className="px-5">
        <h1 className="font-display text-2xl font-bold">Progress</h1>
        <p className="mt-1 text-sm text-muted">Results you can see beat motivation you have to find.</p>
      </FadeUp>

      {/* day-30 before/after */}
      {day30Ready && (
        <FadeUp delay={0.05} className="mt-5 px-5">
          <div className="glass-strong relative overflow-hidden rounded-3xl p-5">
            <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-300" />
              <h2 className="font-display text-lg font-bold">Your 30-day transformation</h2>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                { label: `Day 1 · ${shortDay(firstEntry.day)}`, value: firstEntry.valueNum, photo: firstPhoto },
                { label: `Now · ${shortDay(lastEntry.day)}`, value: lastEntry.valueNum, photo: lastPhoto !== firstPhoto ? lastPhoto : null },
              ].map((side, i) => (
                <div key={i} className="glass rounded-2xl p-3 text-center">
                  {side.photo ? (
                    <Image
                      src={`/api/photos/${side.photo}`}
                      alt={side.label}
                      width={200}
                      height={200}
                      unoptimized
                      className="mx-auto h-28 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-28 items-center justify-center rounded-xl bg-white/4 text-3xl">
                      {i === 0 ? "🌱" : "🌿"}
                    </div>
                  )}
                  <p className="mt-2 text-[10px] font-semibold text-muted">{side.label}</p>
                  <p className="font-display text-xl font-bold">{side.value}</p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-xs text-emerald-300">
              {improving
                ? `${Math.abs(Math.round((lastEntry.valueNum! - firstEntry.valueNum!) * 10) / 10)} ${
                    primaryType === "weight" ? "lbs" : primaryType.startsWith("glucose") ? "mg/dL" : "points"
                  } of progress in 30 days of consistency 👏`
                : "30 days of consistency — the foundation is built 💪"}
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowTestimonial(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-400/25 bg-amber-400/10 py-3 text-sm font-bold text-amber-300"
            >
              <Megaphone className="h-4 w-4" /> Share your story · +50 points
            </motion.button>
          </div>
        </FadeUp>
      )}

      {/* niche-specific logger */}
      <FadeUp delay={0.08} className="mt-5 px-5">
        <div className="glass rounded-3xl p-5">
          {niche === "weight_loss" && (
            <>
              <h3 className="font-display text-base font-bold">Log today</h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                    <Scale className="h-3.5 w-3.5" /> Weight (lbs)
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      inputMode="decimal"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      placeholder="179.5"
                      className="glass w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
                    />
                    <button
                      onClick={() => saveNumber("weight", weight, " lbs", () => setWeight(""))}
                      className="grad shrink-0 rounded-xl px-3 font-display text-sm font-bold text-emerald-950"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                    <Ruler className="h-3.5 w-3.5" /> Waist (in)
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      inputMode="decimal"
                      value={waist}
                      onChange={(e) => setWaist(e.target.value)}
                      placeholder="32.5"
                      className="glass w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
                    />
                    <button
                      onClick={() => saveNumber("waist", waist, " in", () => setWaist(""))}
                      className="grad shrink-0 rounded-xl px-3 font-display text-sm font-bold text-emerald-950"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhotoPicked(e.target.files?.[0] ?? null)} />
              <button
                onClick={() => fileRef.current?.click()}
                className={`glass mt-3 flex w-full items-center justify-center gap-2 rounded-xl border-dashed py-3 text-xs ${pendingPhotoId ? "text-emerald-300" : "text-muted"}`}
              >
                {pendingPhotoId ? <Check className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                {photoBusy ? "Uploading…" : pendingPhotoId ? "Photo attached" : "Progress photo — same spot, same light (optional)"}
              </button>
            </>
          )}

          {niche === "diabetes" && (
            <>
              <h3 className="font-display text-base font-bold">Log today&apos;s readings</h3>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  { label: "Morning (mg/dL)", value: glucoseAm, set: setGlucoseAm, type: "glucose_am" as const, ph: "118" },
                  { label: "Evening (mg/dL)", value: glucosePm, set: setGlucosePm, type: "glucose_pm" as const, ph: "132" },
                ].map((f) => (
                  <div key={f.type}>
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
                      <Droplets className="h-3.5 w-3.5" /> {f.label}
                    </label>
                    <div className="mt-1.5 flex gap-2">
                      <input
                        inputMode="numeric"
                        value={f.value}
                        onChange={(e) => f.set(e.target.value)}
                        placeholder={f.ph}
                        className="glass w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
                      />
                      <button
                        onClick={() => saveNumber(f.type, f.value, " mg/dL", () => f.set(""))}
                        className="grad shrink-0 rounded-xl px-3 font-display text-sm font-bold text-emerald-950"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-white/30">
                Informational tracking only — not medical advice. Keep following your doctor&apos;s guidance.
              </p>
            </>
          )}

          {niche === "mens_health" && (
            <>
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-emerald-300" />
                <h3 className="font-display text-base font-bold">Private check-in</h3>
              </div>
              <p className="mt-1 text-[11px] text-muted">Only you can ever see this. How did things go?</p>
              <div className="mt-3 flex justify-between gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setEdScore(n)}
                    className={`flex h-12 flex-1 items-center justify-center rounded-xl font-display text-lg font-bold transition-all ${
                      edScore === n ? "grad text-emerald-950" : "glass text-muted"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex justify-between px-1 text-[9px] text-white/30">
                <span>Not great</span>
                <span>Outstanding</span>
              </div>
              {edScore !== null && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() =>
                    logResult.mutate(
                      { type: "ed_score", valueNum: edScore },
                      { onSuccess: () => { celebrate("Logged privately · +5 points 🔒"); setEdScore(null); } }
                    )
                  }
                  className="grad mt-3 w-full rounded-xl py-3 font-display text-sm font-bold text-emerald-950"
                >
                  Save private log
                </motion.button>
              )}
            </>
          )}
        </div>
      </FadeUp>

      {/* victories */}
      <FadeUp delay={0.12} className="mt-4 px-5">
        <div className="glass rounded-3xl p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-bold">
            <Trophy className="h-4 w-4 text-amber-300" /> Victories the scale can&apos;t see
          </h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {victoryChips.map((chip) => (
              <button
                key={chip}
                onClick={() => saveVictory(chip)}
                className="glass rounded-full px-3 py-1.5 text-[11px] font-semibold text-muted active:scale-95 transition-transform"
              >
                + {chip}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={victoryText}
              onChange={(e) => setVictoryText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && victoryText.trim() && saveVictory(victoryText.trim())}
              placeholder="Your own victory…"
              className="glass w-full rounded-xl px-3 py-2.5 text-sm placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
            />
            <button
              onClick={() => victoryText.trim() && saveVictory(victoryText.trim())}
              className="grad shrink-0 rounded-xl px-3 font-display font-bold text-emerald-950"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {victories.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {victories.slice(-3).reverse().map((v) => (
                <p key={v.id} className="flex items-center gap-2 text-xs text-muted">
                  <Sparkles className="h-3 w-3 shrink-0 text-amber-300" /> {v.valueText}
                  <span className="ml-auto shrink-0 text-[9px] text-white/25">{shortDay(v.day)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </FadeUp>

      {/* trends */}
      {(
        [
          { type: "weight" as const, title: "Weight", unit: " lbs", color: "#f97316", dir: "down" as const, show: niche === "weight_loss" },
          { type: "waist" as const, title: "Waist", unit: " in", color: "#a3e635", dir: "down" as const, show: niche === "weight_loss" },
          { type: "glucose_am" as const, title: "Morning glucose", unit: " mg/dL", color: "#2dd4bf", dir: "down" as const, show: niche === "diabetes" },
          { type: "glucose_pm" as const, title: "Evening glucose", unit: " mg/dL", color: "#8b5cf6", dir: "down" as const, show: niche === "diabetes" },
          { type: "ed_score" as const, title: "Private trend", unit: "", color: "#3b82f6", dir: "up" as const, show: niche === "mens_health" },
        ] as const
      )
        .filter((c) => c.show && byType(c.type).length > 0)
        .map((c, i) => (
          <FadeUp key={c.type} delay={0.16 + i * 0.05} className="mt-4 px-5">
            <div className="glass rounded-3xl p-5">
              <h3 className="mb-2 font-display text-base font-bold">{c.title}</h3>
              <TrendChart
                points={byType(c.type).map((e) => ({ label: shortDay(e.day), value: e.valueNum! }))}
                unit={c.unit}
                color={c.color}
                goodDirection={c.dir}
              />
            </div>
          </FadeUp>
        ))}

      {/* share-story banner (shown when improving, before day 30) */}
      {improving && !day30Ready && (
        <FadeUp delay={0.2} className="mt-4 px-5">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowTestimonial(true)}
            className="glass flex w-full items-center gap-3 rounded-2xl p-4 text-left"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15">
              <Megaphone className="h-5 w-5 text-amber-300" />
            </div>
            <span>
              <span className="block text-sm font-bold">Loving your results?</span>
              <span className="block text-[11px] text-muted">Share your story — earn +50 points</span>
            </span>
          </motion.button>
        </FadeUp>
      )}

      <FadeUp delay={0.24} className="mt-4 px-5">
        <div className="glass flex items-center gap-3 rounded-2xl p-4">
          <Flame className="h-5 w-5 shrink-0 text-orange-400" fill="currentColor" />
          <p className="text-xs leading-relaxed text-muted">
            Results follow consistency: your {me?.streak ?? 0}-day streak is what makes these charts move.
          </p>
        </div>
      </FadeUp>

      {/* testimonial modal */}
      <AnimatePresence>
        {showTestimonial && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowTestimonial(false)}
          >
            <motion.div
              initial={{ y: 300 }}
              animate={{ y: 0 }}
              exit={{ y: 300 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-t-3xl border border-white/10 bg-[#0d1512] p-6 pb-10"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" />
              <div className="flex items-center gap-2">
                <PartyPopper className="h-5 w-5 text-amber-300" />
                <h2 className="font-display text-lg font-bold">Share your story</h2>
              </div>
              <p className="mt-1 text-xs text-muted">
                Real stories help people just like you take the first step.
              </p>
              <textarea
                value={testimonialText}
                onChange={(e) => setTestimonialText(e.target.value)}
                rows={4}
                placeholder="What changed for you since you started?"
                className="glass mt-4 w-full resize-none rounded-2xl p-4 text-sm placeholder:text-white/25 focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
              />
              <label className="mt-3 flex items-start gap-3 rounded-2xl bg-white/4 p-3">
                <button
                  onClick={() => setConsent(!consent)}
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                    consent ? "grad border-transparent" : "border-white/20"
                  }`}
                >
                  {consent && <Check className="h-3.5 w-3.5 text-emerald-950" strokeWidth={3} />}
                </button>
                <span className="text-[11px] leading-relaxed text-muted">
                  I allow Neo Nature to use my story (first name only) in marketing materials.
                </span>
              </label>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={sendTestimonial}
                className="grad glow mt-4 w-full rounded-2xl py-4 font-display font-bold text-emerald-950"
              >
                {submitTestimonial.isPending ? "Sending…" : "Send my story · +50 points"}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
