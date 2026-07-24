"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, Users, Smartphone, BellRing, UserPlus, UserMinus, Search } from "lucide-react";
import { adminApi } from "@/lib/adminApi";

type CustomerRow = {
  email: string;
  name: string;
  phone: string | null;
  ordersCount: number;
  totalSpent: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  saleOrigin: string;
  products: string[];
  hasApp: boolean;
  onboarded: boolean;
  lastDoseDay: string | null;
  totalDoses: number;
  churnFlag: boolean;
  reachable: boolean;
};
type Stats = {
  customers: number;
  appUsers: number;
  reachable: number;
  churned: number;
  newCustomers: number;
  totalOrders: number;
  totalRevenue: number;
  revenueByOrigin: { origin: string; revenue: number }[];
};
type Resp = {
  stats: Stats;
  facets: { origins: string[]; products: string[] };
  filteredCount: number;
  customers: CustomerRow[];
};

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—";

function StatCard({ icon: Icon, label, value, tone = "text-[var(--accent)]" }: { icon: React.ElementType; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon className={`h-4 w-4 ${tone}`} />
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="mt-1 font-display text-2xl font-bold text-[var(--text)]">{value}</p>
    </div>
  );
}

export default function AdminCustomersPage() {
  const [q, setQ] = useState("");
  const [origin, setOrigin] = useState("");
  const [product, setProduct] = useState("");
  const [status, setStatus] = useState("");
  const [reachable, setReachable] = useState(false);

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (origin) params.set("origin", origin);
  if (product) params.set("product", product);
  if (status) params.set("status", status);
  if (reachable) params.set("reachable", "1");

  const { data } = useQuery({
    queryKey: ["admin-customers", params.toString()],
    queryFn: () => adminApi<Resp>(`/api/admin/customers?${params.toString()}`),
  });

  const stats = data?.stats;
  const rows = data?.customers ?? [];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-[var(--text)]">Customers</h1>
      <p className="mt-1 text-sm text-muted">Lifecycle across BuyGoods orders and app accounts.</p>

      {/* stats */}
      {stats && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard icon={DollarSign} label="Revenue" value={money(stats.totalRevenue)} />
          <StatCard icon={Users} label="Customers" value={stats.customers.toString()} />
          <StatCard icon={Smartphone} label="App users" value={stats.appUsers.toString()} tone="text-sky-600" />
          <StatCard icon={BellRing} label="Reachable" value={stats.reachable.toString()} tone="text-violet-600" />
          <StatCard icon={UserPlus} label="New (30d)" value={stats.newCustomers.toString()} tone="text-emerald-600" />
          <StatCard icon={UserMinus} label="Churned" value={stats.churned.toString()} tone="text-rose-600" />
        </div>
      )}

      {/* revenue by origin */}
      {stats && stats.revenueByOrigin.length > 0 && (
        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-xs font-semibold text-muted">Revenue by sale origin</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {stats.revenueByOrigin.slice(0, 8).map((r) => (
              <span key={r.origin} className="rounded-full bg-[var(--surface)] px-3 py-1 text-sm">
                <span className="font-semibold text-[var(--text)]">{r.origin}</span>{" "}
                <span className="text-[var(--accent)]">{money(r.revenue)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3">
          <Search className="h-4 w-4 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or email"
            className="w-full bg-transparent py-2.5 text-sm focus:outline-none"
          />
        </div>
        <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold">
          <option value="">All origins</option>
          {data?.facets.origins.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={product} onChange={(e) => setProduct(e.target.value)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold">
          <option value="">All products</option>
          {data?.facets.products.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="churned">Churned</option>
        </select>
        <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm font-semibold">
          <input type="checkbox" checked={reachable} onChange={(e) => setReachable(e.target.checked)} /> Push-reachable
        </label>
      </div>

      <p className="mt-3 text-sm text-muted">{data ? `${data.filteredCount} customer${data.filteredCount === 1 ? "" : "s"}` : "Loading…"}</p>

      {/* table */}
      <div className="mt-2 overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">Customer</th>
              <th className="px-4 py-3 font-semibold">Origin</th>
              <th className="px-4 py-3 font-semibold">Orders</th>
              <th className="px-4 py-3 font-semibold">LTV</th>
              <th className="px-4 py-3 font-semibold">First</th>
              <th className="px-4 py-3 font-semibold">Last</th>
              <th className="px-4 py-3 font-semibold">Engagement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((r) => (
              <tr key={r.email} className="hover:bg-[var(--surface)]">
                <td className="px-4 py-3">
                  <p className="font-semibold text-[var(--text)]">{r.name || "—"}</p>
                  <p className="text-xs text-muted">{r.email}</p>
                  <div className="mt-1 flex gap-1">
                    {r.hasApp && <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">App</span>}
                    {r.reachable && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">Push</span>}
                    {r.churnFlag && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Churn</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{r.saleOrigin}</td>
                <td className="px-4 py-3 text-[var(--text)]">{r.ordersCount}</td>
                <td className="px-4 py-3 font-semibold text-[var(--text)]">{money(r.totalSpent)}</td>
                <td className="px-4 py-3 text-muted">{shortDate(r.firstOrderAt)}</td>
                <td className="px-4 py-3 text-muted">{shortDate(r.lastOrderAt)}</td>
                <td className="px-4 py-3 text-muted">
                  {r.hasApp ? (
                    <span>{r.totalDoses} doses · last {shortDate(r.lastDoseDay)}</span>
                  ) : (
                    <span className="text-xs">No app account</span>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted">No customers match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
