"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  AtSign,
  DollarSign,
  Flame,
  LifeBuoy,
  Lock,
  LogIn,
  Package,
  Pencil,
  Phone,
  Pill,
  Plus,
  RotateCcw,
  ShieldAlert,
  Store,
} from "lucide-react";
import { adminApi } from "@/lib/adminApi";
import { useAdmin, useCan } from "@/components/AdminProvider";
import { editableOrderFields } from "@/server/permissions";

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
  /** Order fields locked against the webhook feed (plan §2.1) — see field-locks.ts. */
  lockedFields: string[];
  customerName: string;
  customerPhone: string | null;
  email: string;
  shippingTrackingId: string | null;
};

type Customer360 = {
  id: string;
  name: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  createdAt: string;
  /** Customer fields locked against the webhook feed (plan §2.1) — see field-locks.ts. */
  lockedFields: string[];
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

// Field key -> human label, in the fixed display order from plan §2.1.
const ORDER_FIELD_LABELS: Record<string, string> = {
  address: "Address",
  customerName: "Customer name",
  customerPhone: "Customer phone",
  email: "Email",
  shippingTrackingId: "Tracking number",
};
const ORDER_FIELD_ORDER = ["address", "customerName", "customerPhone", "email", "shippingTrackingId"] as const;

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

/** Lock icon + "Unlock" for one edited field. Renders nothing when the field isn't locked. */
function LockBadge({ locked, onUnlock, unlocking }: { locked: boolean; onUnlock: () => void; unlocking: boolean }) {
  if (!locked) return null;
  return (
    <span className="inline-flex items-center gap-1 font-normal normal-case text-amber-700">
      <span title="Edited in admin — the platform feed won't overwrite this">
        <Lock className="h-3 w-3" />
      </span>
      <button
        type="button"
        onClick={onUnlock}
        disabled={unlocking}
        className="text-[11px] font-bold underline decoration-dotted hover:text-amber-900 disabled:opacity-50"
      >
        {unlocking ? "Unlocking…" : "Unlock"}
      </button>
    </span>
  );
}

function OrderCard({ o, customerId, addOn = false }: { o: CustomerOrder; customerId: string; addOn?: boolean }) {
  const { role } = useAdmin();
  const editableFields = editableOrderFields(role);
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState(o.address || "");
  const [customerName, setCustomerName] = useState(o.customerName || "");
  const [customerPhone, setCustomerPhone] = useState(o.customerPhone || "");
  const [email, setEmail] = useState(o.email || "");
  const [trackingId, setTrackingId] = useState(o.shippingTrackingId || "");
  const [formError, setFormError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-customer", customerId] });
    qc.invalidateQueries({ queryKey: ["admin-customers"] });
  };

  const startEdit = () => {
    setAddress(o.address || "");
    setCustomerName(o.customerName || "");
    setCustomerPhone(o.customerPhone || "");
    setEmail(o.email || "");
    setTrackingId(o.shippingTrackingId || "");
    setFormError(null);
    setEditing(true);
  };

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, string> = {};
      if (editableFields.includes("address") && address.trim() && address.trim() !== o.address) body.address = address.trim();
      // Only send what actually changed — an untouched field must not get locked.
      if (editableFields.includes("customerName") && customerName.trim() && customerName.trim() !== (o.customerName || "")) body.customerName = customerName.trim();
      if (editableFields.includes("customerPhone") && customerPhone.trim() && customerPhone.trim() !== (o.customerPhone || "")) body.customerPhone = customerPhone.trim();
      if (editableFields.includes("email") && email.trim() && email.trim().toLowerCase() !== (o.email || "")) body.email = email.trim();
      if (editableFields.includes("shippingTrackingId") && trackingId.trim() !== (o.shippingTrackingId || "")) body.shippingTrackingId = trackingId.trim();
      if (Object.keys(body).length === 0) return Promise.reject(new Error("no_changes"));
      return adminApi(`/api/admin/orders/${o.id}`, { method: "PATCH", body: JSON.stringify(body) });
    },
    onSuccess: () => {
      setEditing(false);
      invalidate();
    },
    onError: (e: Error) =>
      setFormError(
        e.message === "no_changes"
          ? "Change at least one field."
          : e.message === "no_permission"
            ? "You don't have permission to edit that field."
            : e.message === "invalid_request"
              ? "Check the values and try again."
              : "Couldn't save — try again."
      ),
  });

  const unlock = useMutation({
    mutationFn: (field: string) => adminApi(`/api/admin/orders/${o.id}/locks?field=${encodeURIComponent(field)}`, { method: "DELETE" }),
    onSuccess: invalidate,
    onError: () => setFormError("Couldn't unlock that field."),
  });

  const canEdit = editableFields.length > 0;

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

      {canEdit && (
        <div className="mt-2 border-t border-[var(--border)] pt-2">
          {!editing ? (
            <button
              onClick={startEdit}
              className="flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline"
            >
              <Pencil className="h-3 w-3" /> Edit
            </button>
          ) : (
            <div className="space-y-2.5 rounded-xl bg-[var(--surface)] p-3">
              {ORDER_FIELD_ORDER.filter((f) => editableFields.includes(f)).map((field) => (
                <div key={field}>
                  {field === "address" && (
                    <p className="mb-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-800">
                      This updates the address in this panel only. It does NOT change where BuyGoods/the carrier will
                      ship — update it there too.
                    </p>
                  )}
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                    {ORDER_FIELD_LABELS[field]}
                    <LockBadge
                      locked={o.lockedFields.includes(field)}
                      onUnlock={() => unlock.mutate(field)}
                      unlocking={unlock.isPending && unlock.variables === field}
                    />
                  </label>
                  {field === "address" ? (
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                  ) : field === "customerName" ? (
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                      className="mt-1 w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                  ) : field === "customerPhone" ? (
                    <input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Customer phone"
                      className="mt-1 w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                  ) : field === "email" ? (
                    <input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Order email"
                      className="mt-1 w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                  ) : (
                    <input
                      value={trackingId}
                      onChange={(e) => setTrackingId(e.target.value)}
                      placeholder="Tracking number (blank to clear)"
                      className="mt-1 w-full rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                  )}
                </div>
              ))}
              {formError && <p className="text-xs text-rose-600">{formError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 rounded-lg border border-[var(--border)] py-1.5 text-xs font-semibold text-[var(--text)]"
                >
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
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminCustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [impersonating, setImpersonating] = useState(false);
  const qc = useQueryClient();
  const canEditCustomer = useCan("customers:write");
  const canOpenTicket = useCan("tickets:write");

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-customer", id],
    queryFn: () => adminApi<{ customer: Customer360 }>(`/api/admin/customers/${id}`),
  });
  const c = data?.customer;

  const invalidateCustomer = () => {
    qc.invalidateQueries({ queryKey: ["admin-customer", id] });
    qc.invalidateQueries({ queryKey: ["admin-customers"] });
  };

  // -- customer edit (name / primary email / primary phone) -----------------
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [custName, setCustName] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custError, setCustError] = useState<string | null>(null);

  const startCustomerEdit = () => {
    if (!c) return;
    setCustName(c.name || "");
    setCustEmail(c.primaryEmail || "");
    setCustPhone(c.primaryPhone || "");
    setCustError(null);
    setEditingCustomer(true);
  };

  const saveCustomer = useMutation({
    mutationFn: () =>
      adminApi(`/api/admin/customers/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: custName.trim(),
          primaryEmail: custEmail.trim() ? custEmail.trim() : null,
          primaryPhone: custPhone.trim() ? custPhone.trim() : null,
        }),
      }),
    onSuccess: () => {
      setEditingCustomer(false);
      invalidateCustomer();
    },
    onError: (e: Error) =>
      setCustError(
        e.message === "email_taken"
          ? "That email is already used by another customer."
          : e.message === "invalid_email"
            ? "That doesn't look like a valid email."
            : e.message === "invalid_phone"
              ? "That doesn't look like a valid phone number."
              : "Couldn't save — try again."
      ),
  });

  const unlockCustomerField = useMutation({
    mutationFn: (field: string) => adminApi(`/api/admin/customers/${id}/locks?field=${encodeURIComponent(field)}`, { method: "DELETE" }),
    onSuccess: invalidateCustomer,
    onError: () => setCustError("Couldn't unlock that field."),
  });

  // -- open ticket ------------------------------------------------------------
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [ticketKind, setTicketKind] = useState<"support" | "refund" | "billing">("support");
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketOrderNumber, setTicketOrderNumber] = useState("");
  const [ticketError, setTicketError] = useState<string | null>(null);

  const openTicket = useMutation({
    mutationFn: () =>
      adminApi(`/api/admin/customers/${id}/tickets`, {
        method: "POST",
        body: JSON.stringify({
          subject: ticketSubject.trim(),
          description: ticketDescription.trim() || undefined,
          kind: ticketKind,
          orderNumber: ticketOrderNumber.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      setShowTicketForm(false);
      setTicketKind("support");
      setTicketSubject("");
      setTicketDescription("");
      setTicketOrderNumber("");
      setTicketError(null);
      qc.invalidateQueries({ queryKey: ["admin-customer", id] });
    },
    onError: (e: Error) =>
      setTicketError(
        e.message === "no_contact"
          ? "This customer has no email or phone on file — open the ticket in Freshdesk directly."
          : "Couldn't open the ticket — try again."
      ),
  });

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
        <div className="flex items-center gap-2">
          {canEditCustomer && (
            <button
              onClick={() => (editingCustomer ? setEditingCustomer(false) : startCustomerEdit())}
              className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
            >
              <Pencil className="h-4 w-4" />
              {editingCustomer ? "Cancel" : "Edit"}
            </button>
          )}
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
      </div>

      {editingCustomer && (
        <div className="mt-3 space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4">
          <p className="text-sm font-bold text-[var(--text)]">Edit customer</p>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              Name
              <LockBadge
                locked={c.lockedFields.includes("name")}
                onUnlock={() => unlockCustomerField.mutate("name")}
                unlocking={unlockCustomerField.isPending && unlockCustomerField.variables === "name"}
              />
            </label>
            <input
              value={custName}
              onChange={(e) => setCustName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              Primary email
              <LockBadge
                locked={c.lockedFields.includes("primaryEmail")}
                onUnlock={() => unlockCustomerField.mutate("primaryEmail")}
                unlocking={unlockCustomerField.isPending && unlockCustomerField.variables === "primaryEmail"}
              />
            </label>
            <input
              value={custEmail}
              onChange={(e) => setCustEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          <div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
              Primary phone
              <LockBadge
                locked={c.lockedFields.includes("primaryPhone")}
                onUnlock={() => unlockCustomerField.mutate("primaryPhone")}
                unlocking={unlockCustomerField.isPending && unlockCustomerField.variables === "primaryPhone"}
              />
            </label>
            <input
              value={custPhone}
              onChange={(e) => setCustPhone(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border)] px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
          </div>
          {custError && <p className="text-sm text-rose-600">{custError}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setEditingCustomer(false)}
              className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text)]"
            >
              Cancel
            </button>
            <button
              onClick={() => saveCustomer.mutate()}
              disabled={saveCustomer.isPending}
              className="flex-1 rounded-xl bg-[var(--accent)] py-2.5 text-sm font-display font-bold text-white disabled:opacity-50"
            >
              {saveCustomer.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

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
                <OrderCard o={g.anchor} customerId={id} />
                {g.addOns.map((o) => (
                  <OrderCard key={o.id} o={o} customerId={id} addOn />
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
        {canOpenTicket && (
          <div className="mb-4">
            {!showTicketForm ? (
              <button
                onClick={() => setShowTicketForm(true)}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
              >
                <Plus className="h-4 w-4 text-[var(--accent)]" /> Open ticket
              </button>
            ) : (
              <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4">
                <p className="text-sm font-bold text-[var(--text)]">Open ticket</p>
                <select
                  value={ticketKind}
                  onChange={(e) => setTicketKind(e.target.value as "support" | "refund" | "billing")}
                  className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm font-semibold"
                >
                  <option value="support">Support</option>
                  <option value="refund">Refund</option>
                  <option value="billing">Billing</option>
                </select>
                <input
                  value={ticketSubject}
                  onChange={(e) => setTicketSubject(e.target.value)}
                  placeholder="Subject"
                  className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
                <textarea
                  value={ticketDescription}
                  onChange={(e) => setTicketDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={3}
                  className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
                <input
                  value={ticketOrderNumber}
                  onChange={(e) => setTicketOrderNumber(e.target.value)}
                  placeholder="Order number (optional)"
                  className="w-full rounded-xl border border-[var(--border)] px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                />
                {ticketError && <p className="text-sm text-rose-600">{ticketError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowTicketForm(false)}
                    className="flex-1 rounded-xl border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text)]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => openTicket.mutate()}
                    disabled={openTicket.isPending || !ticketSubject.trim()}
                    className="flex-1 rounded-xl bg-[var(--accent)] py-2.5 text-sm font-display font-bold text-white disabled:opacity-50"
                  >
                    {openTicket.isPending ? "Opening…" : "Open ticket"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
