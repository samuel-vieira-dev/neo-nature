"use client";

import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { LifeBuoy, MapPin, Package, Truck, Check, XCircle } from "lucide-react";
import { useOrder } from "@/lib/hooks";
import { FadeUp, PageHeader, Chip } from "@/components/ui";

const statusChip = {
  confirmed: { tone: "blue" as const, label: "Confirmed" },
  shipped: { tone: "green" as const, label: "Shipped" },
  canceled: { tone: "gray" as const, label: "Canceled" },
  refunded: { tone: "gray" as const, label: "Refunded" },
};

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useOrder(id);
  const order = data?.order;

  if (isLoading) return <PageHeader title="Loading…" backHref="/orders" />;
  if (!order) return <PageHeader title="Order not found" backHref="/orders" />;

  const chip = statusChip[order.status];
  const shipped = order.status === "shipped";
  const ended = order.status === "canceled" || order.status === "refunded";

  return (
    <div>
      <PageHeader title={`Order ${order.number}`} subtitle={order.date} backHref="/orders" />

      {/* status banner */}
      <FadeUp className="px-5">
        <div className="card rounded-3xl p-5">
          <div className="flex items-center gap-3">
            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${ended ? "bg-[var(--surface)]" : shipped ? "bg-[var(--accent-soft)]" : "bg-sky-50"}`}>
              {ended ? (
                <XCircle className="h-6 w-6 text-muted" />
              ) : shipped ? (
                <Truck className="h-6 w-6 text-[var(--accent)]" />
              ) : (
                <Package className="h-6 w-6 text-sky-700" />
              )}
            </div>
            <div className="flex-1">
              <p className="font-display text-lg font-bold text-[var(--text)]">
                {order.status === "confirmed" && "Order confirmed"}
                {order.status === "shipped" && "On its way"}
                {order.status === "canceled" && "Order canceled"}
                {order.status === "refunded" && "Order refunded"}
              </p>
              {order.shippingStatus && <p className="text-sm text-muted">{order.shippingStatus}</p>}
            </div>
            <Chip tone={chip.tone}>{chip.label}</Chip>
          </div>
        </div>
      </FadeUp>

      {/* tracking timeline */}
      <FadeUp delay={0.06} className="mt-4 px-5">
        <div className="card rounded-3xl p-5">
          <h3 className="mb-4 font-display text-base font-bold text-[var(--text)]">Status</h3>
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
                  </span>
                  <div className="min-w-0">
                    <p className={`text-base font-semibold ${step.done ? "text-[var(--text)]" : "text-muted"}`}>
                      {step.label}
                      {step.current && !ended && <span className="ml-2 text-xs font-bold text-[var(--accent)]">NOW</span>}
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
            {order.items.map((it, i) => (
              <div key={i} className="flex items-center gap-3">
                {it.thumbnailUrl ? (
                  <Image src={it.thumbnailUrl} alt={it.productName} width={48} height={48} unoptimized className="h-12 w-12 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)]">
                    <Package className="h-6 w-6 text-muted" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-[var(--text)]">{it.productName}</p>
                  <p className="text-sm text-muted">Qty {it.qty}</p>
                </div>
                <p className="font-display font-bold text-[var(--text)]">${it.price}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
            <span className="text-base text-muted">Total</span>
            <span className="font-display text-lg font-bold text-[var(--text)]">${order.total}</span>
          </div>
        </div>
      </FadeUp>

      {/* address */}
      {order.address && (
        <FadeUp delay={0.14} className="mt-4 px-5">
          <div className="card flex items-center gap-3 rounded-2xl p-4">
            <MapPin className="h-5 w-5 shrink-0 text-[var(--accent)]" />
            <p className="text-sm text-muted">{order.address}</p>
          </div>
        </FadeUp>
      )}

      {/* help */}
      <FadeUp delay={0.18} className="mt-4 px-5">
        <Link href="/support/new">
          <span className="card flex min-h-[56px] items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-muted">
            <LifeBuoy className="h-4 w-4" /> Need help with this order?
          </span>
        </Link>
      </FadeUp>
    </div>
  );
}
