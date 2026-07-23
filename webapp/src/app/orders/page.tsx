"use client";

import Link from "next/link";
import Image from "next/image";
import { ChevronRight, Package } from "lucide-react";
import { FadeUp, PageHeader, Chip } from "@/components/ui";
import { useOrders } from "@/lib/hooks";

const statusChip = {
  confirmed: { tone: "blue" as const, label: "Confirmed" },
  shipped: { tone: "green" as const, label: "Shipped" },
  canceled: { tone: "gray" as const, label: "Canceled" },
  refunded: { tone: "gray" as const, label: "Refunded" },
};

export default function OrdersPage() {
  const { data, isLoading } = useOrders();
  const orders = data?.orders ?? [];

  return (
    <div>
      <PageHeader title="My orders" subtitle={orders.length ? `${orders.length} order${orders.length > 1 ? "s" : ""}` : ""} backHref="/" />

      {orders.length === 0 && !isLoading && (
        <FadeUp className="px-5">
          <div className="card rounded-3xl p-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--surface)]">
              <Package className="h-7 w-7 text-muted" />
            </div>
            <p className="mt-4 text-base font-semibold text-[var(--text)]">No orders yet</p>
            <p className="mt-1 text-sm text-muted">Your orders will show up here automatically after you buy.</p>
          </div>
        </FadeUp>
      )}

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

                  <div className="mt-4 flex items-center gap-3">
                    {o.items[0]?.thumbnailUrl ? (
                      <Image
                        src={o.items[0].thumbnailUrl}
                        alt={o.items[0].productName}
                        width={48}
                        height={48}
                        unoptimized
                        className="h-12 w-12 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--surface)]">
                        <Package className="h-6 w-6 text-muted" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">
                        {o.items.map((it) => `${it.qty > 1 ? `${it.qty}× ` : ""}${it.productName}`).join(", ") || "Order"}
                      </p>
                      {o.shippingStatus && <p className="truncate text-xs text-muted">{o.shippingStatus}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-display text-lg font-bold text-[var(--text)]">${o.total}</p>
                      <p className="flex items-center justify-end gap-1 text-sm font-semibold text-[var(--accent)]">
                        Details <ChevronRight className="h-3.5 w-3.5" />
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            </FadeUp>
          );
        })}
      </div>
    </div>
  );
}
