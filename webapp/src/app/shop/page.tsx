"use client";

import Link from "next/link";
import { useState } from "react";
import { Star, ShieldCheck, Truck, BadgePercent } from "lucide-react";
import { FadeUp } from "@/components/ui";
import Bottle from "@/components/Bottle";
import ComingSoon from "@/components/ComingSoon";
import { products } from "@/lib/data";
import { SHOP_ENABLED } from "@/lib/flags";

function ProductRow({ p }: { p: (typeof products)[number] }) {
  return (
    <Link href={`/shop/${p.id}`}>
      <div className="card flex items-center gap-4 rounded-2xl p-4">
        <div className="shrink-0 rounded-xl bg-[var(--surface)] p-2">
          <Bottle accent={p.accent} label={p.short} className="h-24" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold text-[var(--text)]">{p.name}</p>
          <p className="text-sm text-muted">{p.tagline}</p>
          <div className="mt-1.5 flex items-center gap-1 text-sm text-amber-600">
            <Star className="h-3.5 w-3.5" fill="currentColor" />
            <span className="font-semibold">{p.rating}</span>
            <span className="text-muted">({p.reviews.toLocaleString("en-US")})</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-display text-xl font-bold text-[var(--text)]">${p.price}</span>
            {p.compareAt && <span className="text-sm text-muted line-through">${p.compareAt}</span>}
          </div>
          <span className="mt-2 inline-block text-sm font-bold text-[var(--accent)]">View product →</span>
        </div>
      </div>
    </Link>
  );
}

export default function ShopPage() {
  const [filter, setFilter] = useState("All");

  if (!SHOP_ENABLED) return <ComingSoon />;

  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category)))];
  const filtered = filter === "All" ? products : products.filter((p) => p.category === filter);
  const featured = filtered.filter((p) => p.featured);
  const rest = filtered.filter((p) => !p.featured);

  return (
    <div className="pt-8">
      <FadeUp className="px-5">
        <h1 className="font-display text-2xl font-bold text-[var(--text)]">Our products</h1>
        <p className="mt-1 text-sm text-muted">Formulas designed to be taken daily.</p>
      </FadeUp>

      {/* trust bar */}
      <FadeUp delay={0.04} className="mt-4 px-5">
        <div className="card flex items-center justify-between rounded-2xl px-4 py-3 text-xs font-semibold text-muted">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 text-[var(--accent)]" /> 60-day guarantee
          </span>
          <span className="flex items-center gap-1.5">
            <Truck className="h-4 w-4 text-[var(--accent)]" /> Free US shipping
          </span>
          <span className="flex items-center gap-1.5">
            <BadgePercent className="h-4 w-4 text-[var(--accent)]" /> Member pricing
          </span>
        </div>
      </FadeUp>

      {/* category filter — native select for accessibility */}
      <FadeUp delay={0.06} className="mt-5 px-5">
        <label className="block text-sm font-semibold text-muted" htmlFor="category-filter">
          Filter by category
        </label>
        <select
          id="category-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="card mt-2 w-full min-h-[52px] rounded-2xl px-4 text-base font-semibold text-[var(--text)]"
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </FadeUp>

      {/* featured first */}
      {featured.length > 0 && (
        <FadeUp delay={0.08} className="mt-6 px-5">
          <h2 className="mb-3 font-display text-lg font-bold text-[var(--text)]">Featured</h2>
          <div className="space-y-3">
            {featured.map((p) => (
              <ProductRow key={p.id} p={p} />
            ))}
          </div>
        </FadeUp>
      )}

      {/* more products */}
      {rest.length > 0 && (
        <FadeUp delay={0.12} className="mt-6 px-5">
          <h2 className="mb-3 font-display text-lg font-bold text-[var(--text)]">More products</h2>
          <div className="space-y-3">
            {rest.map((p) => (
              <ProductRow key={p.id} p={p} />
            ))}
          </div>
        </FadeUp>
      )}

      {filtered.length === 0 && <p className="px-5 py-10 text-center text-sm text-muted">Nothing in this category yet.</p>}
    </div>
  );
}
