"use client";

import { motion } from "framer-motion";
import confetti from "canvas-confetti";
import { Clock, Sparkles } from "lucide-react";
import { useApp } from "@/lib/store";
import { useMe, useRewards, useRedeemReward } from "@/lib/hooks";
import { FadeUp, PageHeader } from "@/components/ui";
import { rewards } from "@/lib/data";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;

export default function RewardsPage() {
  const { toast } = useApp();
  const { data: me } = useMe();
  const { data } = useRewards();
  const redeem = useRedeemReward();

  const total = data?.balance.total ?? 0;
  const expiring = data?.balance.expiringSoon ?? 0;

  const handleRedeem = (rewardId: string, name: string, cost: number) => {
    if (total < cost) return toast(`You need ${cost - total} more points for this`);
    redeem.mutate(rewardId, {
      onSuccess: () => {
        confetti({ particleCount: 100, spread: 80, origin: { y: 0.4 }, colors: ["#10b981", "#a3e635", "#fbbf24"] });
        toast(`${name} redeemed! 🎉`);
      },
      onError: () => toast("Not enough points"),
    });
  };

  return (
    <div>
      <PageHeader title="Rewards" subtitle="Consistency pays — literally" backHref="/profile" />

      {/* balance */}
      <FadeUp className="px-5">
        <div className="glass-strong relative overflow-hidden rounded-3xl p-6 text-center">
          <div className="absolute -top-12 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-lime-400/20 blur-3xl" />
          <Sparkles className="mx-auto h-6 w-6 text-lime-300" />
          <p className="mt-2 font-display text-5xl font-extrabold">{total}</p>
          <p className="text-sm font-semibold text-muted">points</p>
          {expiring > 0 && (
            <p className="mx-auto mt-3 w-fit rounded-full bg-amber-400/15 px-3 py-1.5 text-[11px] font-semibold text-amber-300">
              <Clock className="mr-1 inline h-3 w-3" />
              {expiring} points expire {fmtDate(data!.balance.nextExpiryAt) ?? "soon"} — use them!
            </p>
          )}
          <p className="mt-2 text-[10px] text-white/30">
            Earn: +10 daily check-in · +5 progress log · +50 your story · +500 per referral
          </p>
        </div>
      </FadeUp>

      {/* store */}
      <FadeUp delay={0.08} className="mt-5 px-5">
        <h3 className="mb-3 font-display text-lg font-bold">Redeem</h3>
        <div className="space-y-3">
          {rewards.map((r, i) => {
            const affordable = total >= r.cost;
            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.06 }}
                className={`glass flex items-center gap-4 rounded-3xl p-4 ${affordable ? "" : "opacity-60"}`}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/6 text-2xl">
                  {r.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{r.name}</p>
                  <p className="text-[11px] leading-snug text-muted">{r.detail}</p>
                </div>
                <motion.button
                  whileTap={affordable ? { scale: 0.94 } : undefined}
                  onClick={() => handleRedeem(r.id, r.name, r.cost)}
                  className={`shrink-0 rounded-xl px-3 py-2 font-display text-xs font-bold ${
                    affordable ? "grad text-emerald-950" : "bg-white/8 text-white/40"
                  }`}
                >
                  {r.cost} pts
                </motion.button>
              </motion.div>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[10px] text-white/30">
          Points buy upgrades and product — never plain discounts. Your consistency is worth more than a coupon.
        </p>
      </FadeUp>

      {/* history */}
      {data && data.ledger.length > 0 && (
        <FadeUp delay={0.14} className="mt-5 px-5">
          <h3 className="mb-3 font-display text-lg font-bold">History</h3>
          <div className="glass divide-y divide-white/6 rounded-3xl px-5">
            {data.ledger.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-xs font-semibold">{e.reason}</p>
                  {e.expiresAt && e.delta > 0 && (
                    <p className="text-[10px] text-white/30">expires {fmtDate(e.expiresAt)}</p>
                  )}
                </div>
                <span className={`font-display text-sm font-bold ${e.delta > 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {e.delta > 0 ? "+" : ""}
                  {e.delta}
                </span>
              </div>
            ))}
          </div>
        </FadeUp>
      )}

      <FadeUp delay={0.18} className="mt-4 px-5 text-center">
        <p className="text-[11px] text-muted">
          Tier: <span className="font-bold text-white/80">{me?.tier.tier}</span>
          {me?.tier.nextTier && ` · ${me.tier.monthsToNext} subscription month${me.tier.monthsToNext > 1 ? "s" : ""} to ${me.tier.nextTier}`}
        </p>
      </FadeUp>
    </div>
  );
}
