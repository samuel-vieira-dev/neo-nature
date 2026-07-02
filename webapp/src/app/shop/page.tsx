"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Star, ShieldCheck, Truck, BadgePercent } from "lucide-react";
import { FadeUp } from "@/components/ui";
import Bottle from "@/components/Bottle";
import { products } from "@/lib/data";

export default function ShopPage() {
  const featured = products.filter((p) => p.featured);
  const rest = products.filter((p) => !p.featured);

  return (
    <div className="pt-8">
      <FadeUp className="px-5">
        <h1 className="font-display text-2xl font-bold">
          The <span className="text-grad">Neo Nature</span> line
        </h1>
        <p className="mt-1 text-sm text-muted">Formulas designed to work together — and to be taken daily.</p>
      </FadeUp>

      {/* trust bar */}
      <FadeUp delay={0.05} className="mt-4 px-5">
        <div className="glass flex items-center justify-between rounded-2xl px-4 py-3 text-[10px] font-semibold text-muted">
          <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-300" /> 60-day guarantee</span>
          <span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5 text-emerald-300" /> Free US shipping</span>
          <span className="flex items-center gap-1.5"><BadgePercent className="h-3.5 w-3.5 text-emerald-300" /> Member pricing</span>
        </div>
      </FadeUp>

      {/* featured carousel */}
      <FadeUp delay={0.1} className="mt-6">
        <h2 className="mb-3 px-5 font-display text-lg font-bold">Best sellers</h2>
        <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2">
          {featured.map((p, i) => (
            <Link key={p.id} href={`/shop/${p.id}`} className="w-64 shrink-0 snap-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.07 }}
                whileTap={{ scale: 0.97 }}
                className="glass-strong relative overflow-hidden rounded-3xl p-5 text-center"
              >
                <div
                  className="absolute inset-x-0 top-0 h-40 opacity-30"
                  style={{ background: `radial-gradient(circle at 50% -20%, ${p.accent}, transparent 72%)` }}
                />
                <span className="glass absolute left-4 top-4 rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ color: p.accent }}>
                  {p.category}
                </span>
                {p.compareAt && (
                  <span className="absolute right-4 top-4 rounded-full bg-rose-500/90 px-2 py-1 text-[10px] font-bold text-white">
                    -{Math.round((1 - p.price / p.compareAt) * 100)}%
                  </span>
                )}
                <Bottle accent={p.accent} label={p.short} className="mx-auto mt-6 h-40 drop-shadow-2xl" />
                <h3 className="mt-3 font-display text-lg font-bold">{p.name}</h3>
                <p className="text-xs text-muted">{p.tagline}</p>
                <div className="mt-2 flex items-center justify-center gap-1 text-[11px] text-amber-300">
                  <Star className="h-3 w-3" fill="currentColor" />
                  <span className="font-semibold">{p.rating}</span>
                  <span className="text-muted">({p.reviews.toLocaleString("en-US")})</span>
                </div>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <span className="font-display text-xl font-bold">${p.price}</span>
                  {p.compareAt && <span className="text-sm text-muted line-through">${p.compareAt}</span>}
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </FadeUp>

      {/* full catalog */}
      <FadeUp delay={0.18} className="mt-6 px-5">
        <h2 className="mb-3 font-display text-lg font-bold">Full catalog</h2>
        <div className="grid grid-cols-2 gap-3">
          {rest.map((p, i) => (
            <Link key={p.id} href={`/shop/${p.id}`}>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.04 }}
                whileTap={{ scale: 0.96 }}
                className="glass relative overflow-hidden rounded-2xl p-3 pt-4 text-center"
              >
                <div
                  className="absolute inset-x-0 top-0 h-20 opacity-25"
                  style={{ background: `radial-gradient(circle at 50% 0%, ${p.accent}, transparent 70%)` }}
                />
                <Bottle accent={p.accent} label={p.short} className="mx-auto h-24" />
                <p className="mt-2 font-display text-sm font-bold leading-tight">{p.name}</p>
                <p className="mt-0.5 line-clamp-1 text-[10px] text-muted">{p.tagline}</p>
                <p className="mt-1.5 font-display text-sm font-bold text-emerald-300">${p.price}</p>
              </motion.div>
            </Link>
          ))}
        </div>
      </FadeUp>
    </div>
  );
}
