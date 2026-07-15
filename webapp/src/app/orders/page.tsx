"use client";

import Link from "next/link";
import { ChevronRight, RotateCcw } from "lucide-react";
import { FadeUp, PageHeader, Chip } from "@/components/ui";
import Bottle from "@/components/Bottle";
import { productById } from "@/lib/data";
import { useApp } from "@/lib/store";
import { useOrders } from "@/lib/hooks";

const statusChip = {
  processing: { tone: "amber" as const, label: "Processing" },
  in_transit: { tone: "blue" as const, label: "In transit" },
  delivered: { tone: "green" as const, label: "Delivered" },
};

export default function OrdersPage() {
  const { toast } = useApp();
  const { data } = useOrders();
  const orders = data?.orders ?? [];

  return (
    <div>
      <PageHeader title="My orders" subtitle={orders.length ? `${orders.length} orders` : "Loading…"} backHref="/" />

      <div className="space-y-3 px-5">
        {orders.map((o) => {
          const chip = statusChip[o.status];
          return (
            <FadeUp key={o.id}>
              <Link href={`/orders/${o.id}`}>
                <div className="card rounded-3xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display text-base font-bold text-[var(--text)]">Order {o.number}</p>
                      <p className="text-sm text-muted">{o.date}</p>
                    </div>
                    <Chip tone={chip.tone}>{chip.label}</Chip>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    {o.items.map((it) => {
                      const p = productById(it.productId);
                      if (!p) return null;
                      return (
                        <div key={it.productId} className="relative rounded-xl bg-[var(--surface)] p-1.5">
                          <Bottle accent={p.accent} label={p.short} className="h-14" />
                          {it.qty > 1 && (
                            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-bold text-white">
                              ×{it.qty}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <div className="ml-auto text-right">
                      <p className="font-display text-lg font-bold text-[var(--text)]">${o.total}</p>
                      <p className="flex items-center justify-end gap-1 text-sm font-semibold text-[var(--accent)]">
                        View details <ChevronRight className="h-3.5 w-3.5" />
                      </p>
                    </div>
                  </div>

                  {o.status === "delivered" && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        toast("Demo: 1-click reorder → secure checkout (BuyGoods) 🔒");
                      }}
                      className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)] py-2.5 text-sm font-semibold text-[var(--accent-strong)]"
                    >
                      <RotateCcw className="h-4 w-4" /> Buy again
                    </button>
                  )}
                </div>
              </Link>
            </FadeUp>
          );
        })}
      </div>
    </div>
  );
}
