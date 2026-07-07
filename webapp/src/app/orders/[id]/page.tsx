"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Copy, LifeBuoy, MapPin, RotateCcw, Truck, Check } from "lucide-react";
import { useApp } from "@/lib/store";
import { useOrder } from "@/lib/hooks";
import { FadeUp, PageHeader, Chip } from "@/components/ui";
import Bottle from "@/components/Bottle";
import { productById } from "@/lib/data";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useApp();
  const { data, isLoading } = useOrder(id);
  const order = data?.order;

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Loading…" backHref="/orders" />
      </div>
    );
  }

  if (!order) {
    return (
      <div>
        <PageHeader title="Order not found" backHref="/orders" />
      </div>
    );
  }

  const copyTracking = async () => {
    try {
      await navigator.clipboard.writeText(order.trackingNumber ?? "");
      toast("Tracking number copied 📋");
    } catch {
      toast("Couldn't copy — long-press to select");
    }
  };

  const delivered = order.status === "delivered";

  return (
    <div>
      <PageHeader title={`Order ${order.number}`} subtitle={order.date} backHref="/orders" />

      {/* ETA banner */}
      <FadeUp className="px-5">
        <div className="glass-strong relative overflow-hidden rounded-3xl p-5">
          <div className={`absolute -right-8 -top-8 h-32 w-32 rounded-full blur-3xl ${delivered ? "bg-emerald-500/20" : "bg-sky-500/20"}`} />
          <div className="flex items-center gap-3">
            <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl ${delivered ? "bg-emerald-400/15" : "bg-sky-400/15"}`}>
              {delivered ? <Check className="h-6 w-6 text-emerald-300" /> : <Truck className="h-6 w-6 text-sky-300" />}
              {!delivered && <span className="ping-soft absolute right-0 top-0 h-2 w-2 rounded-full bg-sky-400" />}
            </div>
            <div>
              {delivered ? (
                <>
                  <p className="font-display text-lg font-bold">Delivered ✅</p>
                  <p className="text-xs text-muted">{order.tracking.at(-1)?.date}</p>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted">Estimated delivery</p>
                  <p className="font-display text-lg font-bold text-sky-300">{order.eta}</p>
                </>
              )}
            </div>
            <div className="ml-auto">
              <Chip tone={delivered ? "green" : "blue"}>{order.carrier}</Chip>
            </div>
          </div>

          {order.trackingNumber && (
            <button onClick={copyTracking} className="mt-4 flex w-full items-center justify-between rounded-xl bg-white/4 px-4 py-3 active:bg-white/8 transition-colors">
              <span className="font-mono text-xs text-muted">{order.trackingNumber}</span>
              <Copy className="h-4 w-4 text-emerald-300" />
            </button>
          )}
        </div>
      </FadeUp>

      {/* tracking timeline */}
      <FadeUp delay={0.08} className="mt-4 px-5">
        <div className="glass rounded-3xl p-5">
          <h3 className="mb-4 font-display text-base font-bold">Tracking</h3>
          <div className="relative">
            {order.tracking.map((step, i) => {
              const isLast = i === order.tracking.length - 1;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.12 + i * 0.08 }}
                  className="relative flex gap-4 pb-6 last:pb-0"
                >
                  {!isLast && (
                    <span className={`absolute left-[11px] top-6 h-full w-0.5 ${step.done ? "grad" : "bg-white/10"}`} />
                  )}
                  <span
                    className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                      ${step.done ? "grad" : "border-2 border-white/15 bg-[#0d1512]"}
                      ${step.current ? "ring-4 ring-emerald-400/20" : ""}`}
                  >
                    {step.done && <Check className="h-3.5 w-3.5 text-emerald-950" strokeWidth={3.5} />}
                    {step.current && <span className="ping-soft absolute inset-0 rounded-full grad" />}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold ${step.done ? "" : "text-white/35"}`}>
                      {step.label}
                      {step.current && <span className="ml-2 text-[10px] font-bold text-emerald-300">NOW</span>}
                    </p>
                    {step.detail && <p className="text-xs text-muted">{step.detail}</p>}
                    {step.date && <p className="mt-0.5 text-[10px] text-white/30">{step.date}</p>}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </FadeUp>

      {/* items */}
      <FadeUp delay={0.14} className="mt-4 px-5">
        <div className="glass rounded-3xl p-5">
          <h3 className="mb-3 font-display text-base font-bold">Items</h3>
          <div className="space-y-3">
            {order.items.map((it) => {
              const p = productById(it.productId);
              if (!p) return null;
              return (
                <Link key={it.productId} href={`/shop/${p.id}`} className="flex items-center gap-3">
                  <div className="rounded-xl bg-white/4 p-1.5">
                    <Bottle accent={p.accent} label={p.short} className="h-14" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-muted">Qty {it.qty}</p>
                  </div>
                  <p className="font-display font-bold">${it.price}</p>
                </Link>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-white/8 pt-4">
            <span className="text-sm text-muted">Total</span>
            <span className="font-display text-lg font-bold">${order.total}</span>
          </div>
        </div>
      </FadeUp>

      {/* address */}
      <FadeUp delay={0.18} className="mt-4 px-5">
        <div className="glass flex items-center gap-3 rounded-2xl p-4">
          <MapPin className="h-5 w-5 shrink-0 text-emerald-300" />
          <p className="text-xs text-muted">{order.address}</p>
        </div>
      </FadeUp>

      {/* actions */}
      <FadeUp delay={0.22} className="mt-4 flex gap-3 px-5">
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={() => toast("Demo: 1-click reorder → secure checkout (BuyGoods) 🔒")}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 py-3.5 text-sm font-semibold text-emerald-300"
        >
          <RotateCcw className="h-4 w-4" /> Buy again
        </motion.button>
        <Link href="/support/new" className="flex-1">
          <motion.span
            whileTap={{ scale: 0.96 }}
            className="glass flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-muted"
          >
            <LifeBuoy className="h-4 w-4" /> Need help?
          </motion.span>
        </Link>
      </FadeUp>
    </div>
  );
}
