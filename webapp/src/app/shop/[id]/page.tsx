"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Star, ShieldCheck, Pill, Lock } from "lucide-react";
import { useApp } from "@/lib/store";
import { FadeUp, PageHeader, CTA } from "@/components/ui";
import Bottle from "@/components/Bottle";
import { productById } from "@/lib/data";

const mockReviews = [
  { name: "David R.", stars: 5, text: "Been taking it daily for 6 weeks. The difference is real — energy, focus, everything. The app streak kept me honest." },
  { name: "Sarah M.", stars: 5, text: "Fast shipping, great support, and the product does what it says. Already on my second bottle." },
];

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useApp();
  const p = productById(id);

  if (!p) {
    return (
      <div>
        <PageHeader title="Product not found" backHref="/shop" />
        <p className="px-5 text-sm text-muted">This product is no longer available.</p>
      </div>
    );
  }

  const buy = () => toast("Demo: redirecting to secure checkout (BuyGoods) 🔒");

  return (
    <div>
      <PageHeader title={p.name} subtitle={p.category} backHref="/shop" />

      {/* hero */}
      <FadeUp className="px-5">
        <div className="glass-strong relative overflow-hidden rounded-3xl p-6 text-center">
          <div
            className="absolute inset-x-0 top-0 h-56 opacity-35"
            style={{ background: `radial-gradient(circle at 50% -30%, ${p.accent}, transparent 75%)` }}
          />
          <motion.div
            initial={{ y: 24, opacity: 0, rotate: -4 }}
            animate={{ y: 0, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 14 }}
          >
            <Bottle accent={p.accent} label={p.short} className="mx-auto h-52 drop-shadow-2xl" />
          </motion.div>
          <h2 className="mt-4 font-display text-2xl font-bold">{p.name}</h2>
          <p className="text-sm text-muted">{p.tagline}</p>
          <div className="mt-2 flex items-center justify-center gap-1 text-sm text-amber-300">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-3.5 w-3.5" fill={i < Math.round(p.rating) ? "currentColor" : "none"} />
            ))}
            <span className="ml-1 font-semibold">{p.rating}</span>
            <span className="text-xs text-muted">· {p.reviews.toLocaleString("en-US")} verified reviews</span>
          </div>
        </div>
      </FadeUp>

      {/* benefits */}
      <FadeUp delay={0.08} className="mt-4 px-5">
        <div className="glass rounded-3xl p-5">
          <h3 className="font-display text-base font-bold">May help</h3>
          <ul className="mt-3 space-y-2.5">
            {p.benefits.map((b, i) => (
              <motion.li
                key={b}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.12 + i * 0.06 }}
                className="flex items-center gap-3 text-sm"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: `${p.accent}26` }}>
                  <Check className="h-3.5 w-3.5" strokeWidth={3} style={{ color: p.accent }} />
                </span>
                {b}
              </motion.li>
            ))}
          </ul>
        </div>
      </FadeUp>

      {/* dose */}
      <FadeUp delay={0.14} className="mt-4 px-5">
        <div className="glass flex items-center gap-4 rounded-2xl p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-400/15">
            <Pill className="h-5 w-5 text-emerald-300" />
          </div>
          <div className="text-sm">
            <p className="font-semibold">
              {p.capsules} capsules · {p.dosePerDay}/day
            </p>
            <p className="text-xs text-muted">
              {Math.floor(p.capsules / p.dosePerDay)}-day supply — log every dose to build your streak
            </p>
          </div>
        </div>
      </FadeUp>

      {/* reviews */}
      <FadeUp delay={0.2} className="mt-4 px-5">
        <h3 className="mb-3 font-display text-base font-bold">What customers say</h3>
        <div className="space-y-3">
          {mockReviews.map((r) => (
            <div key={r.name} className="glass rounded-2xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{r.name}</p>
                <span className="flex gap-0.5 text-amber-300">
                  {Array.from({ length: r.stars }).map((_, i) => (
                    <Star key={i} className="h-3 w-3" fill="currentColor" />
                  ))}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{r.text}</p>
            </div>
          ))}
        </div>
      </FadeUp>

      {/* sticky buy bar */}
      <FadeUp delay={0.24} className="mt-6 px-5">
        <div className="glass-strong rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold">${p.price}</span>
                {p.compareAt && <span className="text-base text-muted line-through">${p.compareAt}</span>}
              </div>
              <p className="text-[11px] text-muted">Free shipping · Ships within 24h</p>
            </div>
            {p.compareAt && (
              <span className="rounded-full bg-rose-500/90 px-3 py-1.5 text-xs font-bold text-white">
                SAVE ${p.compareAt - p.price}
              </span>
            )}
          </div>
          <div className="mt-4">
            <CTA onClick={buy}>
              <Lock className="h-4 w-4" /> Buy now — secure checkout
            </CTA>
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> 60-day money-back guarantee, no questions asked
          </p>
        </div>
      </FadeUp>
    </div>
  );
}
