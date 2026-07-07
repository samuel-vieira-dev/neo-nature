"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import {
  Bell,
  Flame,
  Package,
  Truck,
  LifeBuoy,
  History,
  ChevronRight,
  Check,
  Play,
  BookOpen,
  Headphones,
  Sparkles,
  Pill,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useMe, useOrders, useCheckIn } from "@/lib/hooks";
import { FadeUp, ProgressRing, CTA } from "@/components/ui";
import Bottle from "@/components/Bottle";
import { products, contentItems, milestones, productById } from "@/lib/data";

const kindIcon = { article: BookOpen, video: Play, audio: Headphones };

export default function Home() {
  const { toast } = useApp();
  const { data: me } = useMe();
  const { data: ordersData } = useOrders();
  const checkInMutation = useCheckIn();

  const hydrated = !!me;
  const streak = me?.streak ?? 0;
  const checkedInToday = me?.checkedInToday ?? false;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const activeOrder = ordersData?.orders.find((o) => o.status === "in_transit");
  const nextMilestone = milestones.find((m) => m > streak) ?? 90;
  const learnPreview = contentItems.filter((c) => !c.locked).slice(1, 5);
  const featured = products.filter((p) => p.featured).slice(0, 5);
  const bottleProduct = me?.bottle ? productById(me.bottle.productId) : null;

  const handleCheckIn = () => {
    if (checkedInToday || checkInMutation.isPending) return;
    checkInMutation.mutate(undefined, {
      onSuccess: (res) => {
        confetti({
          particleCount: 90,
          spread: 75,
          origin: { y: 0.55 },
          colors: ["#10b981", "#a3e635", "#34d399", "#fbbf24"],
        });
        toast(`Day ${res.streak} logged! +10 points 🔥`);
      },
    });
  };

  return (
    <div className="px-5 pt-8">
      {/* header */}
      <FadeUp className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">{greeting},</p>
          <h1 className="font-display text-2xl font-bold">
            {me?.user.name ?? "…"} <span className="inline-block">👋</span>
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <Link href="/notifications" className="glass relative flex h-11 w-11 items-center justify-center rounded-full active:scale-90 transition-transform">
            <Bell className="h-5 w-5" />
            {hydrated && (me?.unread ?? 0) > 0 && (
              <span className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-orange-500 ring-2 ring-[#0d1512]" />
            )}
          </Link>
          <Link href="/profile" className="grad flex h-11 w-11 items-center justify-center rounded-full font-display text-sm font-bold text-emerald-950 active:scale-90 transition-transform">
            {me ? me.user.fullName.split(" ").map((s) => s[0]).join("").slice(0, 2) : "··"}
          </Link>
        </div>
      </FadeUp>

      {/* check-in hero */}
      <FadeUp delay={0.06} className="mt-6">
        <div className="glass-strong relative overflow-hidden rounded-3xl p-5">
          <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="flex items-center gap-4">
            <Link href="/streak">
              <ProgressRing progress={hydrated ? streak / nextMilestone : 0} size={84} stroke={6}>
                <div className="flex flex-col items-center">
                  <Flame className={`h-5 w-5 text-orange-400 ${hydrated && streak > 0 ? "flame" : ""}`} fill="currentColor" />
                  <span className="font-display text-lg font-bold leading-none">{hydrated ? streak : "–"}</span>
                </div>
              </ProgressRing>
            </Link>
            <div className="flex-1">
              <h2 className="font-display text-lg font-bold leading-tight">
                {checkedInToday ? "You showed up today 💪" : "Did you take your supplement?"}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {checkedInToday
                  ? `${nextMilestone - streak} days to your ${nextMilestone}-day badge`
                  : `Keep your ${streak}-day streak alive`}
              </p>
            </div>
          </div>

          <div className="mt-4">
            {checkedInToday ? (
              <Link href="/streak">
                <motion.div whileTap={{ scale: 0.97 }} className="glass flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 font-display font-bold text-emerald-300">
                  <Check className="h-5 w-5" /> Done for today — view streak
                </motion.div>
              </Link>
            ) : (
              <CTA onClick={handleCheckIn}>
                <Flame className="h-5 w-5" fill="currentColor" />
                {checkInMutation.isPending ? "Logging…" : "I took it today"}
              </CTA>
            )}
          </div>
        </div>
      </FadeUp>

      {/* bottle forecast */}
      {me?.bottle && bottleProduct && (
        <FadeUp delay={0.09} className="mt-4">
          <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${bottleProduct.accent}22` }}>
              <Pill className="h-4 w-4" style={{ color: bottleProduct.accent }} />
            </div>
            <p className="flex-1 text-xs text-muted">
              <span className="font-semibold text-white/90">{bottleProduct.name}:</span>{" "}
              {me.bottle.daysLeft > 0 ? (
                <>~{me.bottle.daysLeft} days of doses left</>
              ) : (
                <span className="text-orange-300">bottle is empty — time to restock</span>
              )}
            </p>
            {me.bottle.daysLeft <= 7 && (
              <Link href="/shop" className="shrink-0 rounded-full bg-emerald-400/15 px-3 py-1.5 text-[11px] font-bold text-emerald-300">
                Reorder
              </Link>
            )}
          </div>
        </FadeUp>
      )}

      {/* order in transit */}
      {activeOrder && (
        <FadeUp delay={0.12} className="mt-4">
          <Link href={`/orders/${activeOrder.id}`}>
            <motion.div whileTap={{ scale: 0.98 }} className="glass relative overflow-hidden rounded-3xl p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-400/15">
                    <Truck className="h-5 w-5 text-sky-300" />
                    <span className="ping-soft absolute right-0 top-0 h-2 w-2 rounded-full bg-sky-400" />
                  </div>
                  <div>
                    <p className="font-display text-sm font-bold">Your package is on the way</p>
                    <p className="text-xs text-muted">
                      Arriving <span className="font-semibold text-sky-300">{activeOrder.eta}</span>
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted" />
              </div>
              <div className="mt-4 flex items-center gap-1.5">
                {activeOrder.tracking.map((s, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full ${s.done ? "grad" : "bg-white/10"}`} />
                ))}
              </div>
              <p className="mt-2 text-[11px] text-muted">{activeOrder.tracking.find((s) => s.current)?.detail}</p>
            </motion.div>
          </Link>
        </FadeUp>
      )}

      {/* quick actions */}
      <FadeUp delay={0.18} className="mt-4 grid grid-cols-3 gap-3">
        {[
          { href: activeOrder ? `/orders/${activeOrder.id}` : "/orders", icon: Package, label: "Track order", color: "text-sky-300" },
          { href: "/orders", icon: History, label: "My orders", color: "text-violet-300" },
          { href: "/support", icon: LifeBuoy, label: "Support", color: "text-rose-300" },
        ].map((a) => (
          <Link key={a.label} href={a.href}>
            <motion.div whileTap={{ scale: 0.94 }} className="glass flex flex-col items-center gap-2 rounded-2xl py-4">
              <a.icon className={`h-5 w-5 ${a.color}`} />
              <span className="text-[11px] font-medium text-muted">{a.label}</span>
            </motion.div>
          </Link>
        ))}
      </FadeUp>

      {/* keep learning */}
      <FadeUp delay={0.24} className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Keep learning</h3>
          <Link href="/learn" className="text-xs font-semibold text-emerald-300">
            See all
          </Link>
        </div>
        <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
          {learnPreview.map((c) => {
            const Icon = kindIcon[c.kind];
            return (
              <Link key={c.slug} href={`/learn/${c.slug}`} className="shrink-0">
                <motion.div whileTap={{ scale: 0.96 }} className="glass w-44 rounded-2xl p-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15">
                    <Icon className="h-4 w-4 text-emerald-300" />
                  </div>
                  <p className="mt-3 line-clamp-2 font-display text-sm font-bold leading-snug">{c.title}</p>
                  <p className="mt-1 text-[11px] text-muted">
                    {c.kind} · {c.minutes} min
                  </p>
                </motion.div>
              </Link>
            );
          })}
        </div>
      </FadeUp>

      {/* shop teaser */}
      <FadeUp delay={0.3} className="mt-7">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold">Explore the line</h3>
          <Link href="/shop" className="text-xs font-semibold text-emerald-300">
            Full catalog
          </Link>
        </div>
        <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
          {featured.map((p) => (
            <Link key={p.id} href={`/shop/${p.id}`} className="shrink-0">
              <motion.div
                whileTap={{ scale: 0.96 }}
                className="glass relative w-36 overflow-hidden rounded-2xl p-3 pt-4 text-center"
              >
                <div
                  className="absolute inset-x-0 top-0 h-20 opacity-25"
                  style={{ background: `radial-gradient(circle at 50% 0%, ${p.accent}, transparent 70%)` }}
                />
                <Bottle accent={p.accent} label={p.short} className="mx-auto h-24" />
                <p className="mt-2 font-display text-sm font-bold">{p.name}</p>
                <p className="text-[11px] text-muted">${p.price}</p>
              </motion.div>
            </Link>
          ))}
        </div>
      </FadeUp>

      {/* points footer */}
      <FadeUp delay={0.36} className="mt-6">
        <Link href="/profile">
          <div className="glass flex items-center justify-between rounded-2xl px-5 py-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-lime-300" />
              <div>
                <p className="text-sm font-semibold">{hydrated ? me!.points : "—"} points</p>
                <p className="text-[11px] text-muted">
                  {me
                    ? me.tier.nextTier
                      ? `${me.tier.tier} member · ${me.tier.monthsToNext} more ${me.tier.monthsToNext === 1 ? "month" : "months"} to ${me.tier.nextTier}`
                      : `${me.tier.tier} member`
                    : ""}
                </p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted" />
          </div>
        </Link>
      </FadeUp>
    </div>
  );
}
