"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  AtSign,
  DollarSign,
  Flame,
  LifeBuoy,
  LogIn,
  Package,
  Phone,
  Pill,
  RotateCcw,
  ShieldAlert,
  Store,
} from "lucide-react";
import { adminApi } from "@/lib/adminApi";

type CustomerOrder = {
  id: string;
  number: string;
  placedAt: string;
  status: "confirmed" | "shipped" | "canceled" | "refunded";
  total: number;
  currency: string;
  shippingStatus: string | null;
  trackingUrl: string | null;
  fulfilledAt: string | null;
  refundedAt: string | null;
  chargebackAt: string | null;
  refundAmount: number | null;
  chargebackAmount: number | null;
  saleOrigin: string;
  platform: string;
  platformKey: string;
  paymentMethod: string | null;
  address: string;
  items: { productName: string; sku: string | null; qty: number; price: number }[];
};

type Customer360 = {
  id: string;
  name: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  createdAt: string;
  emails: string[];
  phones: string[];
  buygoodsPairs: { accountId: string; userId: string }[];
  ordersCount: number;
  totalSpent: number;
  refundedTotal: number;
  chargebackTotal: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  purchases: { anchor: CustomerOrder; addOns: CustomerOrder[]; groupTotal: number }[];
  accounts: {
    userId: string;
    hasApp: boolean;
    onboarded: boolean;
    lastLoginAt: string | null;
    memberSince: string | null;
    niche: string | null;
    motivation: string | null;
    churnFlag: boolean;
    streak: number;
    bestStreak: number;
    freezes: number;
    totalDoses: number;
    lastDoseDay: string | null;
    daysWithoutDose: number | null;
    reachable: boolean;
    prefs: { doseReminder: boolean; orderUpdates: boolean; newContent: boolean; offers: boolean };
  }[];
  localTickets: {
    id: string;
    subject: string;
    kind: string;
    status: string;
    orderNumber: string;
    syncStatus: string;
    freshdeskId: number | null;
    createdAt: string;
  }[];
  freshdesk:
    | { ok: true; tickets: { id: number; subject: string; status: string; priority: string; createdAt: string; updatedAt: string; url: string }[] }
    | { ok: false; reason: "not_configured" | "api_error"; detail?: string }
    | null;
};

const money2 = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—";

const statusTones: Record<CustomerOrder["status"], string> = {
  shipped: "bg-emerald-50 text-emerald-700",
  confirmed: "bg-sky-50 text-sky-700",
  canceled: "bg-rose-50 text-rose-700",
  refunded: "bg-amber-50 text-amber-700",
};

function Kpi({ icon: Icon, label, value, tone = "text-[var(--accent)]" }: { icon: React.ElementType; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4">
      <div className="flex items-center gap-2 text-muted">
        <Icon className={`h-4 w-4 ${tone}`} />
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="mt-1 font-display text-xl font-bold text-[var(--text)]">{value}</p>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-2xl border border-[var(--border)] bg-white p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function OrderCard({ o, addOn = false }: { o: CustomerOrder; addOn?: boolean }) {
  return (
    <div className={`rounded-xl border border-[var(--border)] bg-white p-3 ${addOn ? "ml-6" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-display text-sm font-bold text-[var(--text)]">#{o.number}</span>
          {addOn && <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold text-muted">ADD-ON</span>}
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${statusTones[o.status]}`}>{o.status}</span>
        </div>
        <span className="font-semibold text-[var(--text)]">{money2(o.total)} {o.currency}</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-4">
        <span>Placed: {shortDate(o.placedAt)}</span>
        <span>Bought via: {o.platform}</span>
        <span>Attribution: {o.saleOrigin}</span>
        <span>Payment: {o.paymentMethod || "—"}</span>
        <span>
          Fulfillment: {o.shippingStatus || "—"}
          {o.fulfilledAt ? ` (${shortDate(o.fulfilledAt)})` : ""}
        </span>
        {o.trackingUrl && (
          <a href={o.trackingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--accent)] hover:underline">
            Track package →
          </a>
        )}
        {o.chargebackAt && (
          <span className="font-semibold text-rose-700">
            Chargeback: {o.chargebackAmount != null ? money2(o.chargebackAmount) : "amount unknown"}
            {` (${shortDate(o.chargebackAt)})`}
          </span>
        )}
        {o.refundedAt && !o.chargebackAt && (
          <span className="font-semibold text-amber-700">
            Refund: {o.refundAmount != null ? money2(o.refundAmount) : "amount unknown"}
            {o.refundAmount != null && o.refundAmount < o.total ? " (partial)" : ""}
            {` (${shortDate(o.refundedAt)})`}
          </span>
        )}
      </div>
      {o.items.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-[var(--text)]">
          {o.items.map((it, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span>
                {it.productName || "Product"} {it.sku ? `· ${it.sku}` : ""} × {it.qty}
              </span>
              <span className="text-muted">{money2(it.price)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [impersonating, setImpersonating] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-customer", id],
    queryFn: () => adminApi<{ customer: Customer360 }>(`/api/admin/customers/${id}`),
  });
  const c = data?.customer;

  const impersonate = async () => {
    if (!c) return;
    setImpersonating(true);
    try {
      const account = c.accounts[0];
      const payload = account ? { userId: account.userId } : { email: c.primaryEmail };
      await adminApi("/api/admin/impersonate", { method: "POST", body: JSON.stringify(payload) });
      window.open("/orders", "_blank", "noopener");
    } catch {
      alert("Couldn't start the preview session.");
    } finally {
      setImpersonating(false);
    }
  };

  if (isLoading) return <p className="text-sm text-muted">Loading customer…</p>;
  if (error || !c)
    return (
      <div>
        <Link href="/admin" className="flex items-center gap-1 text-sm font-semibold text-[var(--accent)] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Customers
        </Link>
        <p className="mt-4 text-sm text-muted">Customer not found.</p>
      </div>
    );

  return (
    <div>
      <Link href="/admin" className="flex items-center gap-1 text-sm font-semibold text-[var(--accent)] hover:underline">
        <ArrowLeft className="h-4 w-4" /> Customers
      </Link>

      {/* header */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[var(--text)]">{c.name || c.primaryEmail || c.primaryPhone || "Customer"}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
            {c.primaryEmail && (
              <span className="flex items-center gap-1"><AtSign className="h-3.5 w-3.5" /> {c.primaryEmail}</span>
            )}
            {c.primaryPhone && (
              <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {c.primaryPhone}</span>
            )}
            <span className="text-xs">ID {c.id}</span>
          </div>
        </div>
        {(c.accounts.length > 0 || c.primaryEmail) && (
          <button
            onClick={impersonate}
            disabled={impersonating}
            className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"
          >
            <LogIn className="h-4 w-4" />
            {impersonating ? "Opening…" : "View as customer"}
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi icon={DollarSign} label="LTV" value={money2(c.totalSpent)} />
        <Kpi icon={Package} label="Orders" value={String(c.ordersCount)} tone="text-sky-600" />
        <Kpi icon={RotateCcw} label="Refunded" value={c.refundedTotal > 0 ? money2(c.refundedTotal) : "—"} tone="text-amber-600" />
        <Kpi icon={ShieldAlert} label="Chargebacks" value={c.chargebackTotal > 0 ? money2(c.chargebackTotal) : "—"} tone="text-rose-600" />
        <Kpi icon={Store} label="First order" value={shortDate(c.firstOrderAt)} tone="text-muted" />
        <Kpi icon={Store} label="Last order" value={shortDate(c.lastOrderAt)} tone="text-muted" />
      </div>

      {/* identity */}
      <Section icon={AtSign} title="Identity">
        <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold text-muted">Emails seen</p>
            {c.emails.length ? c.emails.map((e) => <p key={e} className="text-[var(--text)]">{e}</p>) : <p className="text-muted">—</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-muted">Phones seen</p>
            {c.phones.length ? c.phones.map((p) => <p key={p} className="text-[var(--text)]">{p}</p>) : <p className="text-muted">—</p>}
          </div>
          <div>
            <p className="text-xs font-semibold text-muted">BuyGoods identities</p>
            {c.buygoodsPairs.length ? (
              c.buygoodsPairs.map((p) => (
                <p key={`${p.accountId}:${p.userId}`} className="text-[var(--text)]">acct {p.accountId} · user {p.userId}</p>
              ))
            ) : (
              <p className="text-muted">—</p>
            )}
          </div>
        </div>
      </Section>

      {/* engagement */}
      <Section icon={Flame} title="App engagement">
        {c.accounts.length === 0 ? (
          <p className="text-sm text-muted">No app account yet.</p>
        ) : (
          c.accounts.map((a) => (
            <div key={a.userId} className="space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {a.hasApp ? (
                  <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-bold text-sky-700">App</span>
                ) : (
                  <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold text-muted">Never signed in</span>
                )}
                {a.onboarded && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">Onboarded</span>}
                {a.reachable && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-bold text-violet-700">Push</span>}
                {a.churnFlag && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Churn</span>}
                {a.niche && <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-bold text-muted">{a.niche}</span>}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                <div>
                  <p className="text-xs font-semibold text-muted">Current streak</p>
                  <p className="font-display text-lg font-bold text-[var(--text)]">
                    {a.streak} day{a.streak === 1 ? "" : "s"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted">Best streak</p>
                  <p className="font-display text-lg font-bold text-[var(--text)]">{a.bestStreak}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted">Doses logged</p>
                  <p className="font-display text-lg font-bold text-[var(--text)]">{a.totalDoses}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted">Last dose</p>
                  <p className="font-display text-lg font-bold text-[var(--text)]">{shortDate(a.lastDoseDay)}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted">Freezes left</p>
                  <p className="font-display text-lg font-bold text-[var(--text)]">{a.freezes}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted">Last login</p>
                  <p className="font-display text-lg font-bold text-[var(--text)]">{shortDate(a.lastLoginAt)}</p>
                </div>
              </div>
              {a.motivation && (
                <p className="text-xs text-muted">
                  Motivation: <span className="text-[var(--text)]">“{a.motivation}”</span>
                </p>
              )}
              <p className="text-xs text-muted">
                Notifications: {(["doseReminder", "orderUpdates", "newContent", "offers"] as const)
                  .filter((k) => a.prefs?.[k])
                  .join(" · ") || "all off"}
              </p>
            </div>
          ))
        )}
      </Section>

      {/* purchases */}
      <Section icon={Package} title={`Purchases (${c.purchases.length})`}>
        {c.purchases.length === 0 ? (
          <p className="text-sm text-muted">No orders.</p>
        ) : (
          <div className="space-y-3">
            {c.purchases.map((g) => (
              <div key={g.anchor.id} className="space-y-2">
                <OrderCard o={g.anchor} />
                {g.addOns.map((o) => (
                  <OrderCard key={o.id} o={o} addOn />
                ))}
                {g.addOns.length > 0 && (
                  <p className="ml-6 text-xs text-muted">Purchase total: {money2(g.groupTotal)}</p>
                )}
              </div>
            ))}
            <p className="pt-1 text-xs text-muted">LTV counts confirmed and shipped orders only.</p>
          </div>
        )}
      </Section>

      {/* support */}
      <Section icon={LifeBuoy} title="Support">
        <p className="text-xs font-semibold text-muted">App tickets</p>
        {c.localTickets.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No tickets opened from the app.</p>
        ) : (
          <div className="mt-1 space-y-2">
            {c.localTickets.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3 text-sm">
                <div>
                  <p className="font-semibold text-[var(--text)]">
                    {t.id} · {t.subject}
                  </p>
                  <p className="text-xs text-muted">
                    {t.kind} · {shortDate(t.createdAt)} · order {t.orderNumber}
                    {t.syncStatus !== "synced" && <span className="ml-1 font-bold text-amber-700">({t.syncStatus})</span>}
                  </p>
                </div>
                <span className="rounded bg-[var(--surface)] px-2 py-0.5 text-xs font-bold text-[var(--text)]">{t.status}</span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-4 text-xs font-semibold text-muted">Freshdesk (live)</p>
        {!c.freshdesk || (c.freshdesk.ok === false && c.freshdesk.reason === "not_configured") ? (
          <p className="mt-1 text-sm text-muted">Freshdesk is not configured.</p>
        ) : c.freshdesk.ok === false ? (
          <p className="mt-1 text-sm text-amber-700">Freshdesk is unavailable right now — try again in a minute.</p>
        ) : c.freshdesk.tickets.length === 0 ? (
          <p className="mt-1 text-sm text-muted">No Freshdesk tickets for this customer.</p>
        ) : (
          <div className="mt-1 space-y-2">
            {c.freshdesk.tickets.map((t) => (
              <a
                key={t.id}
                href={t.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3 text-sm hover:bg-[var(--surface)]"
              >
                <div>
                  <p className="font-semibold text-[var(--text)]">
                    #{t.id} · {t.subject}
                  </p>
                  <p className="text-xs text-muted">
                    {t.priority} · updated {shortDate(t.updatedAt)}
                  </p>
                </div>
                <span className="rounded bg-[var(--surface)] px-2 py-0.5 text-xs font-bold text-[var(--text)]">{t.status}</span>
              </a>
            ))}
          </div>
        )}
      </Section>

      <div className="flex items-center gap-2 py-3">
        <Pill className="h-3.5 w-3.5 text-muted" />
        <p className="text-xs text-muted">Customer since {shortDate(c.createdAt)}.</p>
      </div>
    </div>
  );
}
