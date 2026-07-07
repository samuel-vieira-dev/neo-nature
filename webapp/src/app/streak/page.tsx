"use client";

import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Flame, Shield, Trophy, CalendarDays, Check, Lock, Undo2 } from "lucide-react";
import { useApp } from "@/lib/store";
import { useMe, useCheckIn } from "@/lib/hooks";
import { FadeUp, PageHeader, CTA } from "@/components/ui";
import { milestones } from "@/lib/data";

export default function StreakPage() {
  const { toast } = useApp();
  const { data: me } = useMe();
  const checkInMutation = useCheckIn();

  const hydrated = !!me;
  const streak = me?.streak ?? 0;
  const checkedInToday = me?.checkedInToday ?? false;
  const checkinDays = me?.checkinDays ?? [];
  const freezes = me?.user.freezes ?? 0;
  const today = me?.today ?? new Date().toISOString().slice(0, 10);

  const handleCheckIn = () => {
    if (checkedInToday || checkInMutation.isPending) return;
    checkInMutation.mutate(undefined, {
      onSuccess: (res) => {
        confetti({
          particleCount: 140,
          spread: 90,
          origin: { y: 0.4 },
          colors: ["#10b981", "#a3e635", "#fb923c", "#fbbf24"],
        });
        toast(`Day ${res.streak} logged! +10 points 🔥`);
      },
    });
  };

  // "recover yesterday" is available when yesterday is missing but the day
  // before is logged — no-punishment streaks (spends one freeze)
  const yesterday = new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10);
  const dayBefore = new Date(Date.parse(today) - 2 * 86400000).toISOString().slice(0, 10);
  const canRecover =
    hydrated && freezes > 0 && !checkinDays.includes(yesterday) && checkinDays.includes(dayBefore);

  const handleRecover = () => {
    checkInMutation.mutate(
      { recover: true },
      {
        onSuccess: () => toast("Yesterday recovered — streak saved! 🛡️ (1 freeze used)"),
        onError: () => toast("No freezes left this month"),
      }
    );
  };

  // calendar for the user's current month (respects demo time travel)
  const anchor = new Date(Date.parse(today) + 12 * 3600000);
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const monthName = anchor.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const done = new Set(checkinDays);

  const nextMilestone = milestones.find((m) => m > streak) ?? 90;
  const bestStreak = me?.bestStreak ?? 0;
  const totalDays = me?.totalDays ?? 0;

  return (
    <div>
      <PageHeader title="Your streak" subtitle="Consistency is where results come from" />

      {/* hero flame */}
      <FadeUp className="px-5">
        <div className="glass-strong relative overflow-hidden rounded-3xl p-6 text-center">
          <div className="absolute -top-16 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-orange-500/20 blur-3xl" />
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 18 }}
            className="relative mx-auto flex h-28 w-28 items-center justify-center"
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-orange-500/30 to-transparent blur-xl" />
            <Flame className={`h-20 w-20 text-orange-400 ${hydrated && streak > 0 ? "flame" : ""}`} fill="currentColor" />
          </motion.div>

          <motion.p
            key={streak}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 16 }}
            className="mt-1 font-display text-6xl font-extrabold tracking-tight"
          >
            {hydrated ? streak : "–"}
          </motion.p>
          <p className="font-display text-sm font-semibold text-orange-300">day streak</p>
          <p className="mx-auto mt-2 max-w-60 text-xs text-muted">
            {checkedInToday
              ? `Locked in for today. ${nextMilestone - streak} days until your ${nextMilestone}-day badge.`
              : "One tap keeps the flame alive."}
          </p>

          {!checkedInToday && (
            <div className="mt-5">
              <CTA onClick={handleCheckIn}>
                <Flame className="h-5 w-5" fill="currentColor" />
                {checkInMutation.isPending ? "Logging…" : "I took it today"}
              </CTA>
            </div>
          )}

          {canRecover && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handleRecover}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-400/25 bg-sky-400/10 py-3 text-sm font-semibold text-sky-300"
            >
              <Undo2 className="h-4 w-4" /> Missed yesterday? Recover it (uses 1 freeze)
            </motion.button>
          )}
        </div>
      </FadeUp>

      {/* stats */}
      <FadeUp delay={0.08} className="mt-4 grid grid-cols-3 gap-3 px-5">
        {[
          { icon: Trophy, label: "Best streak", value: bestStreak, color: "text-amber-300", bg: "bg-amber-400/15" },
          { icon: CalendarDays, label: "Total days", value: totalDays, color: "text-emerald-300", bg: "bg-emerald-400/15" },
          { icon: Shield, label: "Freezes left", value: freezes, color: "text-sky-300", bg: "bg-sky-400/15" },
        ].map((s) => (
          <div key={s.label} className="glass rounded-2xl p-3.5 text-center">
            <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-xl ${s.bg}`}>
              <s.icon className={`h-4 w-4 ${s.color}`} />
            </div>
            <p className="mt-2 font-display text-xl font-bold">{hydrated ? s.value : "–"}</p>
            <p className="text-[10px] text-muted">{s.label}</p>
          </div>
        ))}
      </FadeUp>

      {/* streak freeze explainer */}
      <FadeUp delay={0.12} className="mt-4 px-5">
        <div className="glass flex items-start gap-3 rounded-2xl p-4">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-sky-300" />
          <p className="text-xs leading-relaxed text-muted">
            <span className="font-semibold text-sky-300">Streak Freeze:</span> life happens. Miss a day and you can
            recover it the next morning — your flame survives. You get 2 freezes per month.
          </p>
        </div>
      </FadeUp>

      {/* calendar */}
      <FadeUp delay={0.16} className="mt-4 px-5">
        <div className="glass rounded-3xl p-5">
          <h3 className="font-display text-base font-bold">{monthName}</h3>
          <div className="mt-3 grid grid-cols-7 gap-1 text-center">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} className="text-[10px] font-semibold text-muted">
                {d}
              </span>
            ))}
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <span key={`sp-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const isDone = done.has(iso);
              const isToday = iso === today;
              const isFuture = iso > today;
              return (
                <motion.div
                  key={dayNum}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 + i * 0.012 }}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold
                    ${isDone ? "grad text-emerald-950" : isToday ? "border border-dashed border-emerald-400/60 text-emerald-300" : isFuture ? "text-white/25" : "text-muted"}`}
                >
                  {isDone ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : dayNum}
                </motion.div>
              );
            })}
          </div>
        </div>
      </FadeUp>

      {/* milestones */}
      <FadeUp delay={0.22} className="mt-4 px-5">
        <h3 className="mb-3 font-display text-lg font-bold">Milestones</h3>
        <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-2">
          {milestones.map((m) => {
            const reached = streak >= m || bestStreak >= m;
            return (
              <div
                key={m}
                className={`glass w-24 shrink-0 rounded-2xl p-4 text-center ${reached ? "border-amber-400/30" : "opacity-70"}`}
              >
                <div
                  className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
                    reached ? "bg-gradient-to-br from-amber-300 to-orange-500 glow" : "bg-white/8"
                  }`}
                >
                  {reached ? (
                    <Trophy className="h-5 w-5 text-amber-950" />
                  ) : (
                    <Lock className="h-4 w-4 text-white/40" />
                  )}
                </div>
                <p className="mt-2 font-display text-sm font-bold">{m} days</p>
                <p className="text-[10px] text-muted">{reached ? "Unlocked!" : `${m - streak} to go`}</p>
              </div>
            );
          })}
        </div>
      </FadeUp>

      <FadeUp delay={0.26} className="mt-2 px-5 text-center">
        <p className="text-[11px] text-muted">
          Every check-in earns +10 points · You have {hydrated ? me!.points : "—"} points
        </p>
      </FadeUp>
    </div>
  );
}
