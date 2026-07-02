"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Award,
  Bell,
  ChevronRight,
  Clock,
  Flame,
  LifeBuoy,
  LogOut,
  MapPin,
  Package,
  Sparkles,
  CalendarDays,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { FadeUp, Toggle } from "@/components/ui";
import { user } from "@/lib/data";

export default function ProfilePage() {
  const { streak, totalDays, points, prefs, setPref, reminderTime, setReminderTime, toast, hydrated } = useApp();

  const tierProgress = Math.min(1, points / user.nextTierAt);

  return (
    <div className="pt-8">
      {/* identity */}
      <FadeUp className="px-5 text-center">
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="grad glow mx-auto flex h-24 w-24 items-center justify-center rounded-full font-display text-3xl font-bold text-emerald-950"
        >
          MB
        </motion.div>
        <h1 className="mt-3 font-display text-2xl font-bold">{user.fullName}</h1>
        <p className="text-xs text-muted">
          {user.email} · Member since {user.memberSince}
        </p>
      </FadeUp>

      {/* tier card */}
      <FadeUp delay={0.07} className="mt-5 px-5">
        <div className="glass-strong relative overflow-hidden rounded-3xl p-5">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-lime-400/15 blur-3xl" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-300 to-slate-500">
                <Award className="h-5 w-5 text-slate-900" />
              </div>
              <div>
                <p className="font-display text-base font-bold">{user.tier} member</p>
                <p className="text-[11px] text-muted">{hydrated ? points : "—"} points</p>
              </div>
            </div>
            <Sparkles className="h-5 w-5 text-lime-300" />
          </div>
          <div className="mt-4">
            <div className="h-2.5 overflow-hidden rounded-full bg-white/8">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${tierProgress * 100}%` }}
                transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                className="grad h-full rounded-full"
              />
            </div>
            <p className="mt-2 text-[11px] text-muted">
              {user.nextTierAt - points} points to <span className="font-semibold text-amber-300">{user.nextTier}</span> — keep
              checking in daily ✨
            </p>
          </div>
        </div>
      </FadeUp>

      {/* stats */}
      <FadeUp delay={0.12} className="mt-4 grid grid-cols-3 gap-3 px-5">
        {[
          { icon: Flame, value: streak, label: "Day streak", color: "text-orange-300", bg: "bg-orange-400/15" },
          { icon: CalendarDays, value: totalDays, label: "Total days", color: "text-emerald-300", bg: "bg-emerald-400/15" },
          { icon: Sparkles, value: points, label: "Points", color: "text-lime-300", bg: "bg-lime-400/15" },
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

      {/* daily reminder */}
      <FadeUp delay={0.16} className="mt-4 px-5">
        <div className="glass rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-400/15">
                <Clock className="h-5 w-5 text-orange-300" />
              </div>
              <div>
                <p className="text-sm font-semibold">Daily dose reminder</p>
                <p className="text-[11px] text-muted">We&apos;ll nudge you at this time</p>
              </div>
            </div>
            <Toggle on={prefs.doseReminder} onChange={(v) => setPref("doseReminder", v)} />
          </div>
          {prefs.doseReminder && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => {
                  setReminderTime(e.target.value);
                  toast(`Reminder set for ${e.target.value} ⏰`);
                }}
                className="glass w-full rounded-2xl px-4 py-3 text-center font-display text-2xl font-bold focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
              />
            </motion.div>
          )}
        </div>
      </FadeUp>

      {/* address */}
      <FadeUp delay={0.2} className="mt-4 px-5">
        <div className="glass flex items-center gap-3 rounded-2xl p-4">
          <MapPin className="h-5 w-5 shrink-0 text-emerald-300" />
          <div className="flex-1">
            <p className="text-xs font-semibold">Shipping address</p>
            <p className="text-[11px] text-muted">{user.address}</p>
          </div>
          <button onClick={() => toast("Demo: address editing arrives with Phase 2 ✏️")} className="text-xs font-semibold text-emerald-300">
            Edit
          </button>
        </div>
      </FadeUp>

      {/* menu */}
      <FadeUp delay={0.24} className="mt-4 px-5">
        <div className="glass divide-y divide-white/6 rounded-3xl">
          {[
            { href: "/orders", icon: Package, label: "My orders" },
            { href: "/notifications", icon: Bell, label: "Notifications" },
            { href: "/support", icon: LifeBuoy, label: "Help & support" },
          ].map((row) => (
            <Link key={row.href} href={row.href} className="flex items-center gap-3 px-5 py-4 active:bg-white/4">
              <row.icon className="h-5 w-5 text-muted" />
              <span className="flex-1 text-sm font-semibold">{row.label}</span>
              <ChevronRight className="h-4 w-4 text-white/25" />
            </Link>
          ))}
          <button
            onClick={() => toast("Demo: sign-out will be wired to real auth in Phase 2 👋")}
            className="flex w-full items-center gap-3 px-5 py-4 text-left active:bg-white/4"
          >
            <LogOut className="h-5 w-5 text-rose-300" />
            <span className="flex-1 text-sm font-semibold text-rose-300">Sign out</span>
          </button>
        </div>
      </FadeUp>

      <FadeUp delay={0.28} className="mt-6 text-center">
        <p className="text-[10px] text-white/25">
          Neo Nature · v0.1 demo build · made with 💚
        </p>
      </FadeUp>
    </div>
  );
}
