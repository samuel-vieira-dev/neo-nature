"use client";

// Support desk — the CS-facing operational view (plan PLANO-CS-DESK.md §3.1).
// Unlike the admin CRM list (/admin, analytics:read only), this page never
// shows revenue: just open tickets, order/shipping status, and refunds or
// chargebacks as operational flags. Every role that reaches /admin has
// customers:read, so no page-level permission gate is needed here — only the
// per-action gates below (Edit address).

import { Fragment, Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LifeBuoy,
  PackageX,
  RotateCcw,
  ShieldAlert,
  Search,
  Lock,
  Pencil,
  ExternalLink,
} from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { useAdmin } from "@/components/AdminProvider";
import { editableOrderFields } from "@/server/permissions";

// ---------------------------------------------------------------------------
// Contracts — plan §4. Another agent implements the routes in parallel; these
// types are written from the plan, not from the running code, so the routes
// may 404 while this page is being built. Every fetch below degrades to a
// plain error message instead of throwing past the component.
// ---------------------------------------------------------------------------

type StatsResp = {
  openTickets: number;
  awaitingShipment: number;
  refundRequests: number;
  chargebacks7d: number;
  source: "freshdesk" | "local";
  /** The live queue was cut short (rate limit or page cap), so the ticket
      counters are a floor, not an exact total — shown as "400+". */
  ticketsTruncated?: boolean;
};

type TicketRow = {
  id: number;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  requester: { name: string; email: string; phone: string };
  customerId: string | null;
  customerName: string | null;
  fromApp: boolean;
  kind: string | null;
};
type TicketsResp = { source: "freshdesk" | "local"; warning: string | null; truncated: boolean; tickets: TicketRow[] };

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

type DeskCustomerRow = {
  id: string | null;
  name: string;
  email: string;
  phone: string | null;
  lastOrder: { id: string; number: string; status: string; shippingStatusLabel: string | null; trackingUrl: string | null; placedAt: string } | null;
  openTickets: number;
  hasRefund: boolean;
  hasChargeback: boolean;
  hasApp: boolean;
};
type CustomersResp = { customers: DeskCustomerRow[] };

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

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "text-[var(--accent)]",
  onClick,
  active = false,
}: {
  icon: React.ElementType;
  label: string;
  value: number | string;
  tone?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-2xl border bg-white p-4 text-left transition hover:border-[var(--accent)] ${
        active ? "border-[var(--accent)] ring-1 ring-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]"
      }`}
    >
      <div className="flex items-center gap-2 text-muted">
        <Icon className={`h-4 w-4 ${tone}`} />
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="mt-1 font-display text-2xl font-bold text-[var(--text)]">{value}</p>
    </button>
  );
}

function CustomerLink({ id, name, email }: { id: string | null; name: string | null; email: string | null }) {
  if (!id) {
    return (
      <div>
        <p className="font-semibold text-[var(--text)]">{name || "—"}</p>
        {email && <p className="text-xs text-muted">{email}</p>}
      </div>
    );
  }
  return (
    <Link href={`/admin/customers/${id}`} className="block hover:underline">
      <p className="font-semibold text-[var(--accent)]">{name || email || "Customer"}</p>
      {email && <p className="text-xs text-muted">{email}</p>}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Tickets tab
// ---------------------------------------------------------------------------

const TICKET_STATUSES = ["", "Open", "Pending", "Resolved", "Closed"];
const TICKET_KINDS: { value: string; label: string }[] = [
  { value: "", label: "Any kind" },
  { value: "support", label: "Support" },
  { value: "refund", label: "Refund" },
  { value: "billing", label: "Billing" },
];
const TICKET_PRIORITIES: { value: string; label: string }[] = [
  { value: "", label: "Any priority" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

type TicketsInitial = {
  status?: string;
  kind?: string;
  priority?: string;
  updatedFrom?: string;
  updatedTo?: string;
  /** Set only when arriving via a stat card whose counter excludes resolved/closed
   *  tickets (Open tickets, Refund requests) — not a manual filter control. */
  excludeStatus?: string;
};

function TicketsPanel({ initial }: { initial: TicketsInitial }) {
  const [status, setStatus] = useState(initial.status ?? "");
  const [kind, setKind] = useState(initial.kind ?? "");
  const [priority, setPriority] = useState(initial.priority ?? "");
  const [updatedFrom, setUpdatedFrom] = useState(initial.updatedFrom ?? "");
  const [updatedTo, setUpdatedTo] = useState(initial.updatedTo ?? "");
  const [excludeStatus, setExcludeStatus] = useState(initial.excludeStatus ?? "");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (kind) params.set("kind", kind);
  if (priority) params.set("priority", priority);
  if (updatedFrom) params.set("updatedFrom", updatedFrom);
  if (updatedTo) params.set("updatedTo", updatedTo);
  if (excludeStatus) params.set("excludeStatus", excludeStatus);
  if (dq) params.set("q", dq);

  const { data, isLoading, error } = useQuery({
    queryKey: ["support-tickets", params.toString()],
    queryFn: () => adminApi<TicketsResp>(`/api/admin/support/tickets?${params.toString()}`),
  });

  const hasFilters = !!(status || kind || priority || updatedFrom || updatedTo || excludeStatus || q);
  const clearFilters = () => {
    setStatus("");
    setKind("");
    setPriority("");
    setUpdatedFrom("");
    setUpdatedTo("");
    setExcludeStatus("");
    setQ("");
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3">
          <Search className="h-4 w-4 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search subject, name or email"
            className="w-full bg-transparent py-2.5 text-sm focus:outline-none"
          />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold">
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>{s || "All statuses"}</option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold">
          {TICKET_KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </select>
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold">
          {TICKET_PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-muted">
          Updated from
          <input
            type="date"
            value={updatedFrom}
            onChange={(e) => setUpdatedFrom(e.target.value)}
            className="bg-transparent text-sm text-[var(--text)] focus:outline-none"
          />
        </label>
        <label className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-xs font-semibold text-muted">
          Updated to
          <input
            type="date"
            value={updatedTo}
            onChange={(e) => setUpdatedTo(e.target.value)}
            className="bg-transparent text-sm text-[var(--text)] focus:outline-none"
          />
        </label>
        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold text-muted hover:text-[var(--text)]"
          >
            Clear filters
          </button>
        )}
      </div>

      {excludeStatus && (
        <p className="mt-3 rounded-xl bg-[var(--accent-soft)] px-3 py-2 text-xs font-semibold text-[var(--accent)]">
          Excluding {excludeStatus.split(",").join(" and ").toLowerCase()} tickets — matches the counter you clicked.
        </p>
      )}

      {data?.truncated && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          Showing the most recent tickets only — narrow the date range to see older ones.
        </p>
      )}

      {data?.warning && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">{data.warning}</p>
      )}

      {error ? (
        <p className="mt-4 text-sm text-rose-600">Couldn&apos;t load tickets — try again.</p>
      ) : isLoading ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Ticket</th>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Priority</th>
                <th className="px-4 py-3 font-semibold">Updated</th>
                <th className="px-4 py-3 font-semibold">Source</th>
                <th className="px-4 py-3 font-semibold"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {(data?.tickets ?? []).map((t) => (
                <tr key={t.id} className="hover:bg-[var(--surface)]">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--text)]">#{t.id} · {t.subject}</p>
                  </td>
                  <td className="px-4 py-3">
                    <CustomerLink id={t.customerId} name={t.customerName ?? t.requester.name} email={t.requester.email} />
                  </td>
                  <td className="px-4 py-3 text-[var(--text)]">{t.status}</td>
                  <td className="px-4 py-3 text-muted">{t.priority}</td>
                  <td className="px-4 py-3 text-muted">{shortDate(t.updatedAt)}</td>
                  <td className="px-4 py-3">
                    {t.fromApp && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">App</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
                    >
                      Open in Freshdesk <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                </tr>
              ))}
              {(data?.tickets ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted">No tickets match these filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders tab
// ---------------------------------------------------------------------------

const ORDER_STATUSES = ["", "confirmed", "shipped", "canceled", "refunded"];
const ORDER_PROBLEMS: { value: string; label: string }[] = [
  { value: "", label: "Any problem" },
  { value: "awaiting", label: "Awaiting shipment (5d+)" },
  { value: "refund", label: "Refund" },
  { value: "chargeback", label: "Chargeback" },
];
const LIMIT = 50;

function EditAddressForm({ order, onDone }: { order: OrderRow; onDone: () => void }) {
  const qc = useQueryClient();
  const [address, setAddress] = useState(order.address || "");
  const [formError, setFormError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      if (!address.trim() || address.trim() === order.address) return Promise.reject(new Error("no_changes"));
      return adminApi(`/api/admin/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ address: address.trim() }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-orders"] });
      onDone();
    },
    onError: (e: Error) =>
      setFormError(
        e.message === "no_changes"
          ? "Change the address first."
          : e.message === "no_permission"
            ? "You don't have permission to edit that field."
            : "Couldn't save — try again."
      ),
  });

  const unlock = useMutation({
    mutationFn: () => adminApi(`/api/admin/orders/${order.id}/locks?field=address`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-orders"] }),
    onError: () => setFormError("Couldn't unlock that field."),
  });

  return (
    <div className="space-y-2.5 rounded-xl bg-[var(--surface)] p-3">
      <p className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-800">
        This updates the address in this panel only. It does NOT change where BuyGoods/the carrier will ship — update
        it there too.
      </p>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
        Address
        {order.lockedFields.includes("address") && (
          <span className="inline-flex items-center gap-1 font-normal normal-case text-amber-700">
            <span title="Edited in admin — the platform feed won't overwrite this">
              <Lock className="h-3 w-3" />
            </span>
            <button
              type="button"
              onClick={() => unlock.mutate()}
              disabled={unlock.isPending}
              className="text-[11px] font-bold underline decoration-dotted hover:text-amber-900 disabled:opacity-50"
            >
              {unlock.isPending ? "Unlocking…" : "Unlock"}
            </button>
          </span>
        )}
      </label>
      <textarea
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
      />
      {formError && <p className="text-xs text-rose-600">{formError}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={onDone} className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-xs font-semibold text-[var(--text)]">
          Cancel
        </button>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="flex-1 rounded-lg bg-[var(--accent)] py-1.5 text-xs font-display font-bold text-white disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

type OrdersInitial = { status?: string; problem?: string };

function OrdersPanel({ initial }: { initial: OrdersInitial }) {
  const { role } = useAdmin();
  const canEditAddress = editableOrderFields(role).includes("address");
  const [status, setStatus] = useState(initial.status ?? "");
  const [problem, setProblem] = useState(initial.problem ?? "");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [offset, setOffset] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);

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
                        <CustomerLink id={o.customerId} name={o.customerName} email={o.email} />
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
                          {canEditAddress && (
                            <button
                              onClick={() => setEditingId(editingId === o.id ? null : o.id)}
                              className="flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
                            >
                              <Pencil className="h-3 w-3" /> Edit address
                            </button>
                          )}
                          {o.customerId && (
                            <Link href={`/admin/customers/${o.customerId}`} className="text-xs font-semibold text-[var(--accent)] hover:underline">
                              360 →
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                    {editingId === o.id && (
                      <tr>
                        <td colSpan={8} className="bg-[var(--surface)] px-4 py-3">
                          <EditAddressForm order={o} onDone={() => setEditingId(null)} />
                        </td>
                      </tr>
                    )}
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

// ---------------------------------------------------------------------------
// Customers tab
// ---------------------------------------------------------------------------

function CustomersPanel() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const params = new URLSearchParams();
  if (dq) params.set("q", dq);

  const { data, isLoading, error } = useQuery({
    queryKey: ["support-customers", params.toString()],
    queryFn: () => adminApi<CustomersResp>(`/api/admin/support/customers?${params.toString()}`),
  });

  const rows = data?.customers ?? [];

  return (
    <div>
      <div className="flex min-w-[200px] items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3">
        <Search className="h-4 w-4 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, email, phone or order #"
          className="w-full bg-transparent py-2.5 text-sm focus:outline-none"
        />
      </div>

      {error ? (
        <p className="mt-4 text-sm text-rose-600">Couldn&apos;t load customers — try again.</p>
      ) : isLoading ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-semibold">Customer</th>
                <th className="px-4 py-3 font-semibold">Last order</th>
                <th className="px-4 py-3 font-semibold">Open tickets</th>
                <th className="px-4 py-3 font-semibold">Flags</th>
                <th className="px-4 py-3 font-semibold">App</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {rows.map((c) => (
                <tr
                  key={c.id ?? c.email}
                  onClick={() => c.id && router.push(`/admin/customers/${c.id}`)}
                  className={c.id ? "cursor-pointer hover:bg-[var(--surface)]" : ""}
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[var(--text)]">{c.name || "—"}</p>
                    <p className="text-xs text-muted">{c.email}{c.phone ? ` · ${c.phone}` : ""}</p>
                  </td>
                  <td className="px-4 py-3">
                    {c.lastOrder ? (
                      <div>
                        <p className="text-[var(--text)]">#{c.lastOrder.number} · {c.lastOrder.status}</p>
                        <p className="text-xs text-muted">
                          {c.lastOrder.shippingStatusLabel || "—"} · {shortDate(c.lastOrder.placedAt)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text)]">{c.openTickets}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.hasChargeback && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Chargeback</span>}
                      {c.hasRefund && !c.hasChargeback && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Refund</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {c.hasApp ? <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">Yes</span> : <span className="text-xs text-muted">No</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted">No customers match this search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

type Tab = "tickets" | "orders" | "customers";
const TABS: { value: Tab; label: string; icon: React.ElementType }[] = [
  { value: "tickets", label: "Tickets", icon: LifeBuoy },
  { value: "orders", label: "Orders", icon: PackageX },
  { value: "customers", label: "Customers", icon: Search },
];

function SupportPageInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab: Tab = tabParam === "orders" || tabParam === "customers" ? tabParam : "tickets";

  // Switching tabs by hand starts that tab with no filters — filters only
  // carry over when arriving via a stat card's own link (goTo below).
  const setTab = (next: Tab) => {
    const qs = next === "tickets" ? "" : `tab=${next}`;
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const goTo = (next: Tab, filters: Record<string, string>) => {
    const params = new URLSearchParams();
    if (next !== "tickets") params.set("tab", next);
    for (const [k, v] of Object.entries(filters)) params.set(k, v);
    router.push(`${pathname}?${params.toString()}`);
  };

  const { data: stats, error: statsError } = useQuery({
    queryKey: ["support-stats"],
    queryFn: () => adminApi<StatsResp>("/api/admin/support/stats"),
  });

  const ticketsInitial: TicketsInitial = {
    status: searchParams.get("status") ?? "",
    kind: searchParams.get("kind") ?? "",
    priority: searchParams.get("priority") ?? "",
    updatedFrom: searchParams.get("updatedFrom") ?? "",
    updatedTo: searchParams.get("updatedTo") ?? "",
    excludeStatus: searchParams.get("excludeStatus") ?? "",
  };
  const ordersInitial: OrdersInitial = {
    status: searchParams.get("status") ?? "",
    problem: searchParams.get("problem") ?? "",
  };

  // Whether the page's current filters exactly match a stat card's own
  // criteria — used to highlight that card as "active" (see the corresponding
  // getSupportStats definitions in support-desk.ts).
  const isTicketsFilter = (filters: Record<string, string>) =>
    tab === "tickets" && Object.entries(filters).every(([k, v]) => (searchParams.get(k) ?? "") === v);
  const isOrdersFilter = (filters: Record<string, string>) =>
    tab === "orders" && Object.entries(filters).every(([k, v]) => (searchParams.get(k) ?? "") === v);

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-[var(--text)]">Support desk</h1>
      <p className="mt-1 text-sm text-muted">Tickets, orders and customers — everything an agent needs in one place. No revenue here.</p>

      {statsError ? (
        <p className="mt-4 text-sm text-rose-600">Couldn&apos;t load the counters — try again.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            icon={LifeBuoy}
            label="Open tickets"
            value={stats ? `${stats.openTickets}${stats.ticketsTruncated ? "+" : ""}` : "…"}
            onClick={() => goTo("tickets", { excludeStatus: "Resolved,Closed" })}
            active={isTicketsFilter({ excludeStatus: "Resolved,Closed", kind: "" })}
          />
          <StatCard
            icon={PackageX}
            label="Awaiting shipment (5d+)"
            value={stats ? stats.awaitingShipment : "…"}
            tone="text-sky-600"
            onClick={() => goTo("orders", { problem: "awaiting" })}
            active={isOrdersFilter({ problem: "awaiting", status: "" })}
          />
          <StatCard
            icon={RotateCcw}
            label="Refund requests"
            value={stats ? `${stats.refundRequests}${stats.ticketsTruncated ? "+" : ""}` : "…"}
            tone="text-amber-600"
            onClick={() => goTo("tickets", { kind: "refund", excludeStatus: "Resolved,Closed" })}
            active={isTicketsFilter({ kind: "refund", excludeStatus: "Resolved,Closed" })}
          />
          <StatCard
            icon={ShieldAlert}
            label="Chargebacks (7d)"
            value={stats ? stats.chargebacks7d : "…"}
            tone="text-rose-600"
            onClick={() => goTo("orders", { problem: "chargeback" })}
            active={isOrdersFilter({ problem: "chargeback", status: "" })}
          />
        </div>
      )}

      <div className="mt-5 flex items-center gap-1 border-b border-[var(--border)]">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`flex items-center gap-1.5 rounded-t-xl px-3 py-2 text-sm font-semibold ${
              tab === t.value ? "border-b-2 border-[var(--accent)] text-[var(--accent)]" : "text-muted hover:text-[var(--text)]"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "tickets" && <TicketsPanel key={searchParams.toString()} initial={ticketsInitial} />}
        {tab === "orders" && <OrdersPanel key={searchParams.toString()} initial={ordersInitial} />}
        {tab === "customers" && <CustomersPanel />}
      </div>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <SupportPageInner />
    </Suspense>
  );
}
