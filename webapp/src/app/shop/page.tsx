"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Star, ShieldCheck, Truck, BadgePercent, Sparkles, TrendingUp, Layers } from "lucide-react";
import { useApp } from "@/lib/store";
import { useMe, useResults } from "@/lib/hooks";
import { FadeUp } from "@/components/ui";
import Bottle from "@/components/Bottle";
import { products, kits, kitCompareAt, productById, pairsWith, type Kit } from "@/lib/data";

function KitCard({ kit, highlight = false }: { kit: Kit; highlight?: boolean }) {
  const { toast } = useApp();
  const compareAt = kitCompareAt(kit);
  const items = kit.productIds.map((id) => productById(id)!);

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={() => toast("Demo: kit checkout via BuyGoods in Phase 2 🔒")}
      className={`glass-strong relative w-full overflow-hidden rounded-3xl p-5 text-left ${
        highlight ? "border-emerald-400/30" : ""
      }`}
    >
      <div
        className="absolute inset-x-0 top-0 h-32 opacity-25"
        style={{ background: `radial-gradient(circle at 50% -30%, ${kit.accent}, transparent 72%)` }}
      />
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: kit.accent }}>
          <Layers className="h-3 w-3" /> Stack · save ${compareAt - kit.price}
        </span>
        <span className="rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-bold text-white">
          -{Math.round((1 - kit.price / compareAt) * 100)}%
        </span>
      </div>
      <div className="mt-3 flex items-end justify-center gap-1">
        {items.map((p) => (
          <Bottle key={p.id} accent={p.accent} label={p.short} className="h-20" />
        ))}
      </div>
      <p className="mt-3 text-center font-display text-base font-bold">{kit.name}</p>
      <p className="text-center text-[11px] text-muted">{kit.tagline}</p>
      <div className="mt-2 flex items-baseline justify-center gap-2">
        <span className="font-display text-2xl font-bold">${kit.price}</span>
        <span className="text-sm text-muted line-through">${compareAt}</span>
        <span className="text-[10px] text-muted">vs. buying separately</span>
      </div>
    </motion.button>
  );
}

export default function ShopPage() {
  const { data: me } = useMe();
  const { data: resultsData } = useResults();
  const [filter, setFilter] = useState("All");

  const niche = me?.user.niche ?? null;
  const myKit = kits.find((k) => k.niche === niche) ?? null;
  const myProduct = me?.bottle ? productById(me.bottle.productId) : null;

  // cross-sell gate (doc §4): only after the user has FELT a result
  const hasPositiveResult = useMemo(() => {
    const entries = resultsData?.entries ?? [];
    const primary = niche === "diabetes" ? "glucose_am" : niche === "mens_health" ? "ed_score" : "weight";
    const series = entries.filter((e) => e.type === primary && e.valueNum !== null);
    if (series.length < 2) return false;
    const delta = series[series.length - 1].valueNum! - series[0].valueNum!;
    return primary === "ed_score" ? delta > 0 : delta < 0;
  }, [resultsData, niche]);

  const crossSell = myProduct ? productById(pairsWith[myProduct.id] ?? "") : null;

  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category)))];
  const filtered = filter === "All" ? products : products.filter((p) => p.category === filter);
  const featured = filtered.filter((p) => p.featured);
  const rest = filtered.filter((p) => !p.featured);

  return (
    <div className="pt-8">
      <FadeUp className="px-5">
        <h1 className="font-display text-2xl font-bold">
          Your <span className="text-grad">next step</span>
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

      {/* recommended for you — the logical next step */}
      {myKit && (
        <FadeUp delay={0.09} className="mt-6 px-5">
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
            <Sparkles className="h-4 w-4 text-lime-300" /> Recommended for you
          </h2>
          <KitCard kit={myKit} highlight />
        </FadeUp>
      )}

      {/* cross-sell — unlocked only after a felt result */}
      {hasPositiveResult && crossSell && (
        <FadeUp delay={0.12} className="mt-4 px-5">
          <Link href={`/shop/${crossSell.id}`}>
            <motion.div whileTap={{ scale: 0.98 }} className="glass flex items-center gap-3 rounded-3xl border-emerald-400/20 p-4">
              <Bottle accent={crossSell.accent} label={crossSell.short} className="h-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                  <TrendingUp className="h-3 w-3" /> Because your results are showing
                </p>
                <p className="text-sm font-bold">{crossSell.name}</p>
                <p className="truncate text-[11px] text-muted">
                  Amplify what&apos;s already working — pairs with {myProduct?.name}
                </p>
              </div>
              <span className="shrink-0 font-display text-base font-bold text-emerald-300">${crossSell.price}</span>
            </motion.div>
          </Link>
        </FadeUp>
      )}

      {/* all stacks */}
      <FadeUp delay={0.15} className="mt-6">
        <h2 className="mb-3 px-5 font-display text-lg font-bold">Stacks — better together</h2>
        <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2">
          {kits
            .filter((k) => k.id !== myKit?.id)
            .map((k) => (
              <div key={k.id} className="w-72 shrink-0 snap-center">
                <KitCard kit={k} />
              </div>
            ))}
        </div>
      </FadeUp>

      {/* goal filters */}
      <FadeUp delay={0.18} className="mt-6">
        <h2 className="mb-3 px-5 font-display text-lg font-bold">Shop by goal</h2>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-1">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-all ${
                filter === c ? "grad text-emerald-950" : "glass text-muted"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </FadeUp>

      {/* best sellers within filter */}
      {featured.length > 0 && (
        <FadeUp delay={0.2} className="mt-4">
          <div className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2">
            {featured.map((p, i) => (
              <Link key={p.id} href={`/shop/${p.id}`} className="w-64 shrink-0 snap-center">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.06 }}
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
      )}

      {/* full catalog within filter */}
      <FadeUp delay={0.22} className="mt-4 px-5">
        <div className="grid grid-cols-2 gap-3">
          {rest.map((p, i) => (
            <Link key={p.id} href={`/shop/${p.id}`}>
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12 + i * 0.04 }}
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
        {filtered.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">Nothing in this category yet.</p>
        )}
      </FadeUp>
    </div>
  );
}
