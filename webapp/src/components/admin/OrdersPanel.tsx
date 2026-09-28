"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search, Lock } from "lucide-react";
import { useCan } from "@/components/AdminProvider";
import { adminApi } from "@/lib/adminApi";

type OrderRow = {
  id: string;
  number: string;
  placedAt: string;
  status: string;
  customerId: string | null;
  customerName: string;
  email: string;
  phone: string | null;
  productName: string;
  shippingStatus: string | null;
  shippingStatusLabel: string | null;
  trackingUrl: string | null;
  fulfilledAt: string | null;
  platform: string;
  address: string;
  refunded: boolean;
  chargeback: boolean;
  edited: boolean;
  lockedFields: string[];
};
type OrdersResp = { total: number; offset: number; limit: number; orders: OrderRow[] };

const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—";

function useDebounced(value: string, ms = 300) {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

const ORDER_STATUSES = ["", "confirmed", "shipped", "canceled", "refunded"];
const ORDER_PROBLEMS: { value: string; label: string }[] = [
  { value: "", label: "Any problem" },
  { value: "awaiting", label: "Awaiting shipment (5d+)" },
  { value: "refund", label: "Refund" },
  { value: "chargeback", label: "Chargeback" },
];
const LIMIT = 50;

export type OrdersInitial = { status?: string; problem?: string };

export default function OrdersPanel({ initial }: { initial: OrdersInitial }) {
  const canReadCustomers = useCan("customers:read");
  const [status, setStatus] = useState(initial.status ?? "");
  const [problem, setProblem] = useState(initial.problem ?? "");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [offset, setOffset] = useState(0);

  const filterKey = `${status}|${problem}|${dq}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setOffset(0);
  }

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (problem) params.set("problem", problem);
  if (dq) params.set("q", dq);
  params.set("offset", String(offset));
  params.set("limit", String(LIMIT));

  const { data, isLoading, error } = useQuery({
    queryKey: ["support-orders", params.toString()],
    queryFn: () => adminApi<OrdersResp>(`/api/admin/support/orders?${params.toString()}`),
  });

  const rows = data?.orders ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3">
          <Search className="h-4 w-4 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search order #, name, email or phone"
            className="w-full bg-transparent py-2.5 text-sm focus:outline-none"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold">
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{s ? s[0].toUpperCase() + s.slice(1) : "Any status"}</option>
          ))}
        </select>
        <select value={problem} onChange={(e) => setProblem(e.target.value)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold">
          {ORDER_PROBLEMS.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="mt-4 text-sm text-rose-600">Couldn&apos;t load orders — try again.</p>
      ) : isLoading ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : (
        <>
          <p className="mt-3 text-sm text-muted">
            {data && data.total > 0
              ? `Showing ${data.offset + 1}–${data.offset + rows.length} of ${data.total} order${data.total === 1 ? "" : "s"}`
              : "0 orders"}
          </p>
          <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Fulfillment</th>
                  <th className="px-4 py-3 font-semibold">Platform</th>
                  <th className="px-4 py-3 font-semibold">Flags</th>
                  <th className="px-4 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {rows.map((o) => (
                  <Fragment key={o.id}>
                    <tr className="hover:bg-[var(--surface)]">
                      <td className="px-4 py-3">
                        <p className="font-display text-sm font-bold text-[var(--text)]">#{o.number}</p>
                        <p className="text-xs text-muted">{shortDate(o.placedAt)}</p>
                      </td>
                      <td className="px-4 py-3">
                        {canReadCustomers && o.customerId ? <Link href={`/admin/customers/${o.customerId}`} className="font-semibold text-[var(--accent)]">{o.customerName || o.email}</Link> : <p className="font-semibold">{o.customerName || "—"}</p>}
                        <p className="text-xs text-muted">{o.email}</p>
                      </td>
                      <td className="px-4 py-3 text-[var(--text)]">{o.productName || "—"}</td>
                      <td className="px-4 py-3 text-[var(--text)]">{o.status}</td>
                      <td className="px-4 py-3 text-muted">
                        {o.shippingStatusLabel || o.shippingStatus || "—"}
                        {o.trackingUrl && (
                          <>
                            {" · "}
                            <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--accent)] hover:underline">
                              Track →
                            </a>
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">{o.platform}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {o.chargeback && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Chargeback</span>}
                          {o.refunded && !o.chargeback && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Refund</span>}
                          {o.edited && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold text-muted">
                              <Lock className="h-2.5 w-2.5" /> Edited
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/admin/orders/${encodeURIComponent(o.id)}`} className="text-xs font-semibold text-[var(--accent)] hover:underline">Open order →</Link>
                          {canReadCustomers && o.customerId && (
                            <Link href={`/admin/customers/${o.customerId}`} className="text-xs font-semibold text-[var(--accent)] hover:underline">
                              360 →
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-muted">No orders match these filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {data && data.total > LIMIT && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <button
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                disabled={offset === 0}
                className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 font-semibold text-[var(--text)] disabled:opacity-40"
              >
                ← Previous
              </button>
              <span className="text-muted">
                Page {Math.floor(offset / LIMIT) + 1} of {Math.max(1, Math.ceil(data.total / LIMIT))}
              </span>
              <button
                onClick={() => setOffset(offset + LIMIT)}
                disabled={offset + LIMIT >= data.total}
                className="rounded-xl border border-[var(--border)] bg-white px-3 py-2 font-semibold text-[var(--text)] disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
