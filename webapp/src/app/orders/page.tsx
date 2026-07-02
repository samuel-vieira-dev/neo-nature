"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, RotateCcw } from "lucide-react";
import { FadeUp, PageHeader, Chip } from "@/components/ui";
import Bottle from "@/components/Bottle";
import { orders, productById } from "@/lib/data";
import { useApp } from "@/lib/store";

const statusChip = {
  processing: { tone: "amber" as const, label: "Processing" },
  in_transit: { tone: "blue" as const, label: "In transit" },
  delivered: { tone: "green" as const, label: "Delivered" },
};

export default function OrdersPage() {
  const { toast } = useApp();

  return (
    <div>
      <PageHeader title="My orders" subtitle={`${orders.length} orders since April 2026`} backHref="/" />

      <div className="space-y-3 px-5">
        {orders.map((o, i) => {
          const chip = statusChip[o.status];
          return (
            <FadeUp key={o.id} delay={i * 0.07}>
              <Link href={`/orders/${o.id}`}>
                <motion.div whileTap={{ scale: 0.98 }} className="glass rounded-3xl p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display text-sm font-bold">Order {o.number}</p>
                      <p className="text-xs text-muted">{o.date}</p>
                    </div>
                    <Chip tone={chip.tone}>{chip.label}</Chip>
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    {o.items.map((it) => {
                      const p = productById(it.productId)!;
                      return (
                        <div key={it.productId} className="relative rounded-xl bg-white/4 p-1.5">
                          <Bottle accent={p.accent} label={p.short} className="h-14" />
                          {it.qty > 1 && (
                            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-emerald-950">
                              ×{it.qty}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <div className="ml-auto text-right">
                      <p className="font-display text-lg font-bold">${o.total}</p>
                      <p className="flex items-center justify-end gap-1 text-[11px] text-emerald-300">
                        View details <ChevronRight className="h-3 w-3" />
                      </p>
                    </div>
                  </div>

                  {o.status === "delivered" && (
                    <motion.button
                      whileTap={{ scale: 0.96 }}
                      onClick={(e) => {
                        e.preventDefault();
                        toast("Demo: 1-click reorder → secure checkout (BuyGoods) 🔒");
                      }}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 py-2.5 text-sm font-semibold text-emerald-300"
                    >
                      <RotateCcw className="h-4 w-4" /> Buy again
                    </motion.button>
                  )}
                </motion.div>
              </Link>
            </FadeUp>
          );
        })}
      </div>
    </div>
  );
}
