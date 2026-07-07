"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Award,
  Bell,
  ChevronRight,
  Clock,
  Crown,
  Flame,
  Gift,
  LifeBuoy,
  LogOut,
  MapPin,
  Package,
  Sparkles,
  CalendarDays,
  BookOpen,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useMe, useUpdatePrefs, useReminders, useReminderMutations, useLogout } from "@/lib/hooks";
import { FadeUp, Toggle } from "@/components/ui";
import DemoControls from "@/components/DemoControls";

const tierStyles: Record<string, string> = {
  Bronze: "from-amber-600 to-amber-800",
  Silver: "from-slate-300 to-slate-500",
  Gold: "from-amber-300 to-yellow-500",
};

export default function ProfilePage() {
  const { toast } = useApp();
  const { data: me } = useMe();
  const updatePrefs = useUpdatePrefs();
  const { data: remindersData } = useReminders();
  const reminderMutations = useReminderMutations();
  const logout = useLogout();

  const hydrated = !!me;
  const firstReminder = remindersData?.reminders[0];
  const initials = me ? me.user.fullName.split(" ").map((s) => s[0]).join("").slice(0, 2) : "··";

  // months → next tier progress
  const tier = me?.tier;
  const monthsActive = me?.subscription?.monthsActive ?? 0;
  const tierTarget = tier?.tier === "Bronze" ? 3 : tier?.tier === "Silver" ? 6 : 6;
  const tierProgress = Math.min(1, monthsActive / tierTarget);

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
          {initials}
        </motion.div>
        <h1 className="mt-3 font-display text-2xl font-bold">{me?.user.fullName ?? "…"}</h1>
        <p className="text-xs text-muted">
          {me?.user.email}
          {me && (
            <>
              {" "}
              · Member since {new Date(me.user.memberSince).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
            </>
          )}
        </p>
      </FadeUp>

      {/* tier card — based on subscription months */}
      <FadeUp delay={0.07} className="mt-5 px-5">
        <div className="glass-strong relative overflow-hidden rounded-3xl p-5">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-lime-400/15 blur-3xl" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${tierStyles[tier?.tier ?? "Bronze"]}`}>
                <Award className="h-5 w-5 text-black/70" />
              </div>
              <div>
                <p className="font-display text-base font-bold">{tier?.tier ?? "…"} member</p>
                <p className="text-[11px] text-muted">
                  {hydrated ? `${me!.points} points` : "—"}
                  {me && me.pointsExpiringSoon > 0 && (
                    <span className="text-amber-300"> · {me.pointsExpiringSoon} expiring soon</span>
                  )}
                </p>
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
              {tier?.nextTier ? (
                <>
                  {tier.monthsToNext} more {tier.monthsToNext === 1 ? "month" : "months"} of membership to{" "}
                  <span className="font-semibold text-amber-300">{tier.nextTier}</span> ✨
                </>
              ) : (
                <>You&apos;ve reached the top tier — enjoy the perks 🏆</>
              )}
            </p>
          </div>
        </div>
      </FadeUp>

      {/* stats */}
      <FadeUp delay={0.12} className="mt-4 grid grid-cols-3 gap-3 px-5">
        {[
          { icon: Flame, value: me?.streak ?? 0, label: "Day streak", color: "text-orange-300", bg: "bg-orange-400/15" },
          { icon: CalendarDays, value: me?.totalDays ?? 0, label: "Total days", color: "text-emerald-300", bg: "bg-emerald-400/15" },
          { icon: Sparkles, value: me?.points ?? 0, label: "Points", color: "text-lime-300", bg: "bg-lime-400/15" },
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
                <p className="text-[11px] text-muted">
                  {firstReminder?.habitAnchor ? `Anchored: ${firstReminder.habitAnchor}` : "We'll nudge you at this time"}
                </p>
              </div>
            </div>
            <Toggle
              on={me?.user.prefs.doseReminder ?? false}
              onChange={(v) => updatePrefs.mutate({ doseReminder: v })}
            />
          </div>
          {me?.user.prefs.doseReminder && firstReminder && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4">
              <input
                type="time"
                value={firstReminder.time}
                onChange={(e) => {
                  reminderMutations.update.mutate({ id: firstReminder.id, time: e.target.value });
                  toast(`Reminder set for ${e.target.value} ⏰`);
                }}
                className="glass w-full rounded-2xl px-4 py-3 text-center font-display text-2xl font-bold focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
              />
              {(remindersData?.reminders.length ?? 0) > 1 && (
                <p className="mt-2 text-center text-[11px] text-muted">
                  +{remindersData!.reminders.length - 1} more reminder{remindersData!.reminders.length > 2 ? "s" : ""} configured
                </p>
              )}
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
            <p className="text-[11px] text-muted">{me?.user.address}</p>
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
            { href: "/subscription", icon: Crown, label: "My subscription" },
            { href: "/rewards", icon: Sparkles, label: "Rewards" },
            { href: "/referral", icon: Gift, label: "Refer a friend" },
            { href: "/orders", icon: Package, label: "My orders" },
            { href: "/notifications", icon: Bell, label: "Notifications" },
            { href: "/learn", icon: BookOpen, label: "Learn" },
            { href: "/support", icon: LifeBuoy, label: "Help & support" },
          ].map((row) => (
            <Link key={row.href} href={row.href} className="flex items-center gap-3 px-5 py-4 active:bg-white/4">
              <row.icon className="h-5 w-5 text-muted" />
              <span className="flex-1 text-sm font-semibold">{row.label}</span>
              <ChevronRight className="h-4 w-4 text-white/25" />
            </Link>
          ))}
          <button
            onClick={() => logout.mutate()}
            className="flex w-full items-center gap-3 px-5 py-4 text-left active:bg-white/4"
          >
            <LogOut className="h-5 w-5 text-rose-300" />
            <span className="flex-1 text-sm font-semibold text-rose-300">Sign out</span>
          </button>
        </div>
      </FadeUp>

      {/* demo controls */}
      <FadeUp delay={0.28} className="mt-4 px-5">
        <DemoControls />
      </FadeUp>

      <FadeUp delay={0.32} className="mt-6 text-center">
        <p className="text-[10px] text-white/25">Neo Nature · v0.2 demo build · made with 💚</p>
      </FadeUp>
    </div>
  );
}
