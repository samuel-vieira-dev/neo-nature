"use client";

import { motion } from "framer-motion";
import { Copy, Gift, Share2, Trophy, Users } from "lucide-react";
import { useApp } from "@/lib/store";
import { useReferral } from "@/lib/hooks";
import { FadeUp, PageHeader } from "@/components/ui";

export default function ReferralPage() {
  const { toast } = useApp();
  const { data } = useReferral();

  const shareUrl = data ? `https://neonature.app/r/${data.code}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast("Referral link copied 📋");
    } catch {
      toast("Couldn't copy — long-press to select");
    }
  };

  const share = async () => {
    const text = `I've been on Neo Nature and it's actually working. Use my link for 20% off your first order: ${shareUrl}`;
    if (navigator.share) {
      await navigator.share({ title: "Neo Nature", text }).catch(() => {});
    } else {
      await copy();
    }
  };

  return (
    <div>
      <PageHeader title="Refer a friend" subtitle="Results are better shared" backHref="/profile" />

      {/* offer card */}
      <FadeUp className="px-5">
        <div className="glass-strong relative overflow-hidden rounded-3xl p-6 text-center">
          <div className="absolute -top-12 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />
          <Gift className="mx-auto h-7 w-7 text-emerald-300" />
          <h2 className="mt-3 font-display text-xl font-bold leading-tight">
            Give <span className="text-grad">20% off</span>, earn{" "}
            <span className="text-grad">{data?.pointsPerConversion ?? 500} points</span>
          </h2>
          <p className="mx-auto mt-2 max-w-64 text-xs text-muted">
            Your friend gets 20% off their first order. You get {data?.pointsPerConversion ?? 500} points when they buy —
            enough for real rewards.
          </p>

          <button onClick={copy} className="glass mx-auto mt-4 flex w-full items-center justify-between rounded-2xl px-4 py-3.5 active:bg-white/8 transition-colors">
            <span className="truncate font-mono text-xs text-muted">{shareUrl || "…"}</span>
            <Copy className="h-4 w-4 shrink-0 text-emerald-300" />
          </button>

          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={share}
            className="grad glow mt-3 flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-display font-bold text-emerald-950"
          >
            <Share2 className="h-5 w-5" /> Share my link
          </motion.button>
        </div>
      </FadeUp>

      {/* stats */}
      <FadeUp delay={0.08} className="mt-4 grid grid-cols-2 gap-3 px-5">
        <div className="glass rounded-2xl p-4 text-center">
          <Users className="mx-auto h-4 w-4 text-sky-300" />
          <p className="mt-1.5 font-display text-2xl font-bold">{data?.invitedCount ?? "–"}</p>
          <p className="text-[10px] text-muted">Friends invited</p>
        </div>
        <div className="glass rounded-2xl p-4 text-center">
          <Gift className="mx-auto h-4 w-4 text-emerald-300" />
          <p className="mt-1.5 font-display text-2xl font-bold">{data?.convertedCount ?? "–"}</p>
          <p className="text-[10px] text-muted">Became customers</p>
        </div>
      </FadeUp>

      {/* leaderboard */}
      <FadeUp delay={0.12} className="mt-5 px-5">
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <Trophy className="h-4 w-4 text-amber-300" /> Top referrers this month
        </h3>
        <div className="glass divide-y divide-white/6 rounded-3xl px-5">
          {(data?.leaderboard ?? []).map((row) => (
            <div key={row.rank} className={`flex items-center gap-3 py-3.5 ${row.you ? "text-emerald-300" : ""}`}>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-xs font-bold ${
                  row.rank === 1
                    ? "bg-gradient-to-br from-amber-300 to-orange-500 text-amber-950"
                    : row.rank === 2
                    ? "bg-gradient-to-br from-slate-300 to-slate-500 text-slate-900"
                    : row.rank === 3
                    ? "bg-gradient-to-br from-amber-600 to-amber-800 text-amber-100"
                    : "bg-white/8 text-white/50"
                }`}
              >
                {row.rank}
              </span>
              <span className={`flex-1 text-sm ${row.you ? "font-bold" : "font-semibold"}`}>{row.name}</span>
              <span className="text-xs text-muted">{row.converted} referrals</span>
            </div>
          ))}
        </div>
      </FadeUp>

      <FadeUp delay={0.16} className="mt-4 px-5 text-center">
        <p className="text-[10px] text-white/30">Demo — referral tracking goes live with BuyGoods integration (Phase 2)</p>
      </FadeUp>
    </div>
  );
}
