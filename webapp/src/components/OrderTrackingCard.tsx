"use client";

import Link from "next/link";
import { Check, ChevronRight, ExternalLink, Package, Truck, XCircle } from "lucide-react";
import type { OrderDto } from "@/lib/hooks";
import { humanizeStatus } from "@/lib/tracking";

/**
 * Compact "where is my package" card for Home. Headline = the order's current
 * step, a short timeline underneath, the carrier link when there is one, and
 * a tap-through to the full order page.
 */
export default function OrderTrackingCard({ order }: { order: OrderDto }) {
  const shipped = order.status === "shipped";
  const ended = order.status === "canceled" || order.status === "refunded";
  const current = order.tracking.find((s) => s.current) ?? order.tracking.filter((s) => s.done).at(-1);
  const headline =
    order.status === "confirmed"
      ? "Preparing your order"
      : order.status === "shipped"
        ? order.delivered
          ? "Delivered"
          : "On its way"
        : order.status === "canceled"
          ? "Order canceled"
          : "Order refunded";
  const itemLabel = order.items.map((it) => `${it.qty > 1 ? `${it.qty}× ` : ""}${it.productName}`).join(", ");

  return (
    <div className="card rounded-3xl p-5">
      <div className="flex items-center gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            ended ? "bg-[var(--surface)]" : shipped ? "bg-[var(--accent-soft)]" : "bg-sky-50"
          }`}
        >
          {ended ? (
            <XCircle className="h-6 w-6 text-muted" />
          ) : shipped ? (
            <Truck className="h-6 w-6 text-[var(--accent)]" />
          ) : (
            <Package className="h-6 w-6 text-sky-700" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold text-[var(--text)]">{headline}</p>
          <p className="truncate text-sm text-muted">
            Order {order.number}
            {itemLabel ? ` · ${itemLabel}` : ""}
          </p>
        </div>
      </div>

      {current && !ended && (
        <p className="mt-3 text-sm text-muted">
          <span className="font-semibold text-[var(--text)]">{humanizeStatus(current.label)}</span>
          {current.detail && current.detail !== current.label ? ` — ${humanizeStatus(current.detail)}` : ""}
          {current.date ? ` · ${current.date}` : ""}
        </p>
      )}

      {/* mini timeline */}
      {!ended && order.tracking.length > 1 && (
        <ol className="mt-4 flex items-center gap-1.5" aria-label="Tracking progress">
          {order.tracking.map((s, i) => (
            <li key={i} className="flex flex-1 items-center gap-1.5">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  s.done ? "bg-[var(--accent)]" : "border-2 border-[var(--border)] bg-white"
                } ${s.current ? "ring-4 ring-[var(--accent-soft)]" : ""}`}
              >
                {s.done && <Check className="h-3 w-3 text-white" strokeWidth={3.5} />}
              </span>
              {i < order.tracking.length - 1 && (
                <span className={`h-0.5 flex-1 ${s.done ? "bg-[var(--accent)]" : "bg-[var(--border)]"}`} />
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 flex gap-2">
        {order.trackingUrl && (
          <a
            href={order.trackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-sm font-semibold text-white"
          >
            <Truck className="h-4 w-4" /> Track package <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        <Link
          href={`/orders/${order.id}`}
          className={`flex min-h-[48px] items-center justify-center gap-1 rounded-2xl border border-[var(--border)] px-4 text-sm font-semibold text-[var(--text)] ${
            order.trackingUrl ? "" : "flex-1"
          }`}
        >
          Details <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
