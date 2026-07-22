"use client";

import { useParams } from "next/navigation";
import { Check, Star, ShieldCheck, Pill, Lock, Play } from "lucide-react";
import { useApp } from "@/lib/store";
import { FadeUp, PageHeader, CTA } from "@/components/ui";
import Bottle from "@/components/Bottle";
import ComingSoon from "@/components/ComingSoon";
import { productById } from "@/lib/data";
import { SHOP_ENABLED } from "@/lib/flags";

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useApp();
  const p = productById(id);

  if (!SHOP_ENABLED) return <ComingSoon />;

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
        <div className="card rounded-3xl p-6 text-center">
          <Bottle accent={p.accent} label={p.short} className="mx-auto h-52" />
          <h2 className="mt-4 font-display text-2xl font-bold text-[var(--text)]">{p.name}</h2>
          <p className="text-sm text-muted">{p.tagline}</p>
          <div className="mt-2 flex items-center justify-center gap-1 text-sm text-amber-600">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="h-4 w-4" fill={i < Math.round(p.rating) ? "currentColor" : "none"} />
            ))}
            <span className="ml-1 font-semibold text-[var(--text)]">{p.rating}</span>
            <span className="text-sm text-muted">· {p.reviews.toLocaleString("en-US")} verified reviews</span>
          </div>
        </div>
      </FadeUp>

      {/* benefits */}
      <FadeUp delay={0.06} className="mt-4 px-5">
        <div className="card rounded-3xl p-5">
          <h3 className="font-display text-base font-bold text-[var(--text)]">May help</h3>
          <ul className="mt-3 space-y-3">
            {p.benefits.map((b) => (
              <li key={b} className="flex items-center gap-3 text-base text-[var(--text)]">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)]">
                  <Check className="h-4 w-4 text-[var(--accent)]" strokeWidth={3} />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>
      </FadeUp>

      {/* dose */}
      <FadeUp delay={0.1} className="mt-4 px-5">
        <div className="card flex items-center gap-4 rounded-2xl p-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)]">
            <Pill className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="text-sm">
            <p className="font-semibold text-[var(--text)]">
              {p.capsules} capsules · {p.dosePerDay}/day
            </p>
            <p className="text-sm text-muted">
              {Math.floor(p.capsules / p.dosePerDay)}-day supply — log every dose to build your streak
            </p>
          </div>
        </div>
      </FadeUp>

      {/* how to take it — posology video placeholder */}
      <FadeUp delay={0.12} className="mt-4 px-5">
        <button
          onClick={() => toast("Demo: 30-second posology video plays here in Phase 2 ▶️")}
          className="card flex w-full items-center gap-3 rounded-2xl p-4"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]">
            <Play className="ml-0.5 h-4 w-4 text-white" fill="currentColor" />
          </span>
          <span className="text-left">
            <span className="block text-base font-bold text-[var(--text)]">How to take {p.name} — 30 sec</span>
            <span className="block text-sm text-muted">Dosage, timing and what to pair it with</span>
          </span>
        </button>
      </FadeUp>

      {/* rating summary */}
      <FadeUp delay={0.14} className="mt-4 px-5">
        <div className="card flex items-center gap-3 rounded-2xl p-4">
          <span className="flex items-center gap-1 text-amber-600">
            <Star className="h-5 w-5" fill="currentColor" />
          </span>
          <p className="text-sm text-[var(--text)]">
            <span className="font-bold">{p.rating} out of 5</span>{" "}
            <span className="text-muted">from {p.reviews.toLocaleString("en-US")} verified customers</span>
          </p>
        </div>
      </FadeUp>

      {/* sticky buy bar */}
      <FadeUp delay={0.18} className="mt-6 px-5">
        <div className="card rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold text-[var(--text)]">${p.price}</span>
                {p.compareAt && <span className="text-base text-muted line-through">${p.compareAt}</span>}
              </div>
              <p className="text-sm text-muted">Free shipping · Ships within 24h</p>
            </div>
            {p.compareAt && (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-bold text-amber-800">
                SAVE ${p.compareAt - p.price}
              </span>
            )}
          </div>
          <div className="mt-4">
            <CTA onClick={buy}>
              <Lock className="h-4 w-4" /> Buy now
            </CTA>
          </div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-sm text-muted">
            <ShieldCheck className="h-4 w-4 text-[var(--accent)]" /> 60-day money-back guarantee, no questions asked
          </p>
        </div>
      </FadeUp>
    </div>
  );
}
