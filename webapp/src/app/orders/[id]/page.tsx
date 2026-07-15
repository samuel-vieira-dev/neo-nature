"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
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
        <div className="card rounded-3xl p-5">
          <div className="flex items-center gap-3">
            <div className={`relative flex h-12 w-12 items-center justify-center rounded-2xl ${delivered ? "bg-[var(--accent-soft)]" : "bg-sky-50"}`}>
              {delivered ? <Check className="h-6 w-6 text-[var(--accent)]" /> : <Truck className="h-6 w-6 text-sky-700" />}
              {!delivered && <span className="ping-soft absolute right-0 top-0 h-2 w-2 rounded-full bg-sky-600" />}
            </div>
            <div>
              {delivered ? (
                <>
                  <p className="font-display text-lg font-bold text-[var(--text)]">Delivered ✅</p>
                  <p className="text-sm text-muted">{order.tracking.at(-1)?.date}</p>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">Estimated delivery</p>
                  <p className="font-display text-lg font-bold text-sky-700">{order.eta}</p>
                </>
              )}
            </div>
            <div className="ml-auto">
              <Chip tone={delivered ? "green" : "blue"}>{order.carrier}</Chip>
            </div>
          </div>

          {order.trackingNumber && (
            <button onClick={copyTracking} className="mt-4 flex min-h-[52px] w-full items-center justify-between rounded-xl bg-[var(--surface)] px-4 py-3 active:bg-[var(--border)] transition-colors">
              <span className="font-mono text-sm text-muted">{order.trackingNumber}</span>
              <Copy className="h-4 w-4 text-[var(--accent)]" />
            </button>
          )}
        </div>
      </FadeUp>

      {/* tracking timeline */}
      <FadeUp delay={0.06} className="mt-4 px-5">
        <div className="card rounded-3xl p-5">
          <h3 className="mb-4 font-display text-base font-bold text-[var(--text)]">Tracking</h3>
          <div className="relative">
            {order.tracking.map((step, i) => {
              const isLast = i === order.tracking.length - 1;
              return (
                <div key={i} className="relative flex gap-4 pb-6 last:pb-0">
                  {!isLast && (
                    <span className={`absolute left-[11px] top-6 h-full w-0.5 ${step.done ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
                  )}
                  <span
                    className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full
                      ${step.done ? "bg-[var(--accent)]" : "border-2 border-[var(--border)] bg-white"}
                      ${step.current ? "ring-4 ring-[var(--accent-soft)]" : ""}`}
                  >
                    {step.done && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.5} />}
                    {step.current && <span className="ping-soft absolute inset-0 rounded-full bg-[var(--accent)]" />}
                  </span>
                  <div className="min-w-0">
                    <p className={`text-base font-semibold ${step.done ? "text-[var(--text)]" : "text-muted"}`}>
                      {step.label}
                      {step.current && <span className="ml-2 text-xs font-bold text-[var(--accent)]">NOW</span>}
                    </p>
                    {step.detail && <p className="text-sm text-muted">{step.detail}</p>}
                    {step.date && <p className="mt-0.5 text-xs text-muted">{step.date}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </FadeUp>

      {/* items */}
      <FadeUp delay={0.1} className="mt-4 px-5">
        <div className="card rounded-3xl p-5">
          <h3 className="mb-3 font-display text-base font-bold text-[var(--text)]">Items</h3>
          <div className="space-y-3">
            {order.items.map((it) => {
              const p = productById(it.productId);
              if (!p) return null;
              return (
                <Link key={it.productId} href={`/shop/${p.id}`} className="flex items-center gap-3">
                  <div className="rounded-xl bg-[var(--surface)] p-1.5">
                    <Bottle accent={p.accent} label={p.short} className="h-14" />
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-semibold text-[var(--text)]">{p.name}</p>
                    <p className="text-sm text-muted">Qty {it.qty}</p>
                  </div>
                  <p className="font-display font-bold text-[var(--text)]">${it.price}</p>
                </Link>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
            <span className="text-base text-muted">Total</span>
            <span className="font-display text-lg font-bold text-[var(--text)]">${order.total}</span>
          </div>
        </div>
      </FadeUp>

      {/* address */}
      <FadeUp delay={0.14} className="mt-4 px-5">
        <div className="card flex items-center gap-3 rounded-2xl p-4">
          <MapPin className="h-5 w-5 shrink-0 text-[var(--accent)]" />
          <p className="text-sm text-muted">{order.address}</p>
        </div>
      </FadeUp>

      {/* actions */}
      <FadeUp delay={0.18} className="mt-4 flex gap-3 px-5">
        <button
          onClick={() => toast("Demo: 1-click reorder → secure checkout (BuyGoods) 🔒")}
          className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] py-3.5 text-sm font-semibold text-[var(--accent-strong)]"
        >
          <RotateCcw className="h-4 w-4" /> Buy again
        </button>
        <Link href="/support/new" className="flex-1">
          <span className="card flex min-h-[56px] items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-muted">
            <LifeBuoy className="h-4 w-4" /> Need help?
          </span>
        </Link>
      </FadeUp>
    </div>
  );
}
