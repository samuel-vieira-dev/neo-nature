"use client";

// Support desk — the CS-facing operational view (plan PLANO-CS-DESK.md §3.1).
// Unlike the admin CRM list (/admin, analytics:read only), this page never
// shows revenue. Access to this desk is separate from the Customer 360.

import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LifeBuoy,
  PackageX,
  RotateCcw,
  ShieldAlert,
  Search,
} from "lucide-react";
import OrdersPanel, { type OrdersInitial } from "@/components/admin/OrdersPanel";
import SupportEmailPanel from "@/components/admin/SupportEmailPanel";
import { useCan } from "@/components/AdminProvider";
import NoAccess from "@/components/NoAccess";
import { adminApi } from "@/lib/adminApi";

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

function CustomersPanel() {
  const router = useRouter();
  const canReadCustomers = useCan("customers:read");
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
                  onClick={() => canReadCustomers && c.id && router.push(`/admin/customers/${c.id}`)}
                  className={canReadCustomers && c.id ? "cursor-pointer hover:bg-[var(--surface)]" : ""}
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
        {tab === "tickets" && <SupportEmailPanel key={searchParams.toString()} initialTicket={searchParams.get("ticket")} initialStatus={searchParams.get("status") ?? ""} initialKind={searchParams.get("kind") ?? ""} initialExcludeStatus={searchParams.get("excludeStatus") ?? ""} />}
        {tab === "orders" && <OrdersPanel key={searchParams.toString()} initial={ordersInitial} />}
        {tab === "customers" && <CustomersPanel />}
      </div>
    </div>
  );
}

export default function SupportPage() {
  const canRead = useCan("support:read");
  if (!canRead) return <NoAccess />;
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <SupportPageInner />
    </Suspense>
  );
}
