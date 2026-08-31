import { db, rawSql } from "@/db";
import type { Customer, Order, User } from "@/db/schema";
import { buildTrackingUrl } from "@/lib/tracking";
import { purchaseOriginOf } from "@/server/sales-platform";

// ---------------------------------------------------------------------------
// CRM aggregation. A "customer" is keyed by the canonical customers.id
// (stamped by src/server/customer-identity.ts); rows that predate the backfill
// or missed the resolver fall back to the historical email/phone clustering so
// nothing ever drops off the list. Powers the admin customer list, the
// top-line stats, and the push-audience resolver — all from one source so
// filters match. Only identity is materialized in the customers table;
// everything aggregated here stays derived at read time.
// ---------------------------------------------------------------------------

export type CustomerOrder = {
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
  /** Where the money was processed: "BuyGoods · Zensulin", "Konnektive", … */
  platform: string;
  /** Filter key for the same thing ("buygoods:11227"). */
  platformKey: string;
  paymentMethod: string | null;
  address: string;
  items: { productName: string; sku: string | null; qty: number; price: number }[];
};

export type CustomerRow = {
  /** Canonical customers.id — null only for legacy fallback rows (no customer
      row yet, i.e. pre-backfill data the resolver hasn't seen). */
  id: string | null;
  email: string;
  name: string;
  phone: string | null;
  ordersCount: number;
  totalSpent: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  saleOrigin: string;
  /** Every platform/merchant account this customer has bought through — a
      cross-sell customer legitimately appears under more than one. */
  platforms: string[];
  platformKeys: string[];
  products: string[];
  hasApp: boolean;
  onboarded: boolean;
  lastDoseDay: string | null;
  totalDoses: number;
  churnFlag: boolean;
  reachable: boolean; // has at least one push subscription
  userId: string | null;
  orders: CustomerOrder[];
};

export type CustomerFilters = {
  origin?: string;
  platform?: string;
  product?: string;
  status?: "active" | "churned" | "all";
  reachable?: boolean;
  hasApp?: boolean;
  q?: string;
};

const REVENUE_STATUSES = new Set(["confirmed", "shipped"]);

type OrderItemLite = { orderId: string; productName: string; sku: string | null; qty: number; price: string | number };
type DoseAgg = { user_id: string; cnt: string; last_day: string | null };

/**
 * Pure aggregation fold — separated from I/O so the clustering behavior is
 * unit-testable. Key resolution per row:
 *   1. customer_id when stamped (canonical);
 *   2. else the customers row whose primary_email matches (bridges the window
 *      where old rows are unstamped but the customer already exists);
 *   3. else the legacy email/phone clustering (prefixed key, id = null).
 */
export function foldCustomers(
  allOrders: Order[],
  allItems: OrderItemLite[],
  allUsers: User[],
  allCustomers: Customer[],
  doseAgg: DoseAgg[],
  pushUserIds: string[]
): CustomerRow[] {
  const itemsByOrder = new Map<string, CustomerOrder["items"]>();
  for (const it of allItems) {
    const arr = itemsByOrder.get(it.orderId) ?? [];
    arr.push({ productName: it.productName, sku: it.sku, qty: it.qty, price: Number(it.price) });
    itemsByOrder.set(it.orderId, arr);
  }
  const dosesByUser = new Map(doseAgg.map((d) => [d.user_id, { count: Number(d.cnt), last: d.last_day }]));
  const reachableUsers = new Set(pushUserIds);
  const customersById = new Map(allCustomers.map((c) => [c.id, c]));
  const customerByEmail = new Map(
    allCustomers.filter((c) => c.primaryEmail).map((c) => [c.primaryEmail!, c.id])
  );

  const map = new Map<string, CustomerRow>();
  const get = (key: string): CustomerRow => {
    let row = map.get(key);
    if (!row) {
      const canonical = key.startsWith("legacy:") ? null : customersById.get(key) ?? null;
      row = {
        id: canonical ? canonical.id : null,
        email: canonical?.primaryEmail ?? (key.startsWith("legacy:") ? key.slice("legacy:".length) : ""),
        name: canonical?.name ?? "",
        phone: canonical?.primaryPhone ?? null,
        ordersCount: 0, totalSpent: 0,
        firstOrderAt: null, lastOrderAt: null, saleOrigin: "Direct", platforms: [], platformKeys: [], products: [],
        hasApp: false, onboarded: false, lastDoseDay: null, totalDoses: 0,
        churnFlag: false, reachable: false, userId: null, orders: [],
      };
      map.set(key, row);
    }
    return row;
  };

  const keyForOrder = (o: Order): string | null => {
    if (o.customerId) return o.customerId;
    const email = o.email ? o.email.toLowerCase() : "";
    if (email) return customerByEmail.get(email) ?? `legacy:${email}`;
    return null; // matches the historical CRM: email-less unstamped orders are invisible
  };

  // fold in orders (sorted so lastOrder wins for saleOrigin/name)
  const sorted = [...allOrders].sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());
  const orderKeys = new Map<string, string>(); // order id -> row key (for the user fold below)
  const productSet = new Map<string, Set<string>>();
  const platformSet = new Map<string, Map<string, string>>(); // row key -> platform key -> label
  for (const o of sorted) {
    const key = keyForOrder(o);
    if (!key) continue;
    orderKeys.set(o.id, key);
    const row = get(key);
    row.ordersCount += 1;
    if (REVENUE_STATUSES.has(o.status)) row.totalSpent += Number(o.total);
    const at = o.placedAt.toISOString();
    row.firstOrderAt = row.firstOrderAt ?? at;
    row.lastOrderAt = at;
    if (o.customerName) row.name = o.customerName;
    if (o.customerPhone) row.phone = o.customerPhone;
    if (!row.email && o.email) row.email = o.email.toLowerCase();
    row.saleOrigin = o.saleOrigin || row.saleOrigin;
    const origin = purchaseOriginOf(o);
    const platforms = platformSet.get(key) ?? new Map<string, string>();
    platforms.set(origin.key, origin.label);
    platformSet.set(key, platforms);
    const items = itemsByOrder.get(o.id) ?? [];
    const set = productSet.get(key) ?? new Set<string>();
    for (const it of items) if (it.productName) set.add(it.productName);
    productSet.set(key, set);
    row.orders.push({
      id: o.id,
      number: o.buygoodsOrderId ?? o.number, // order_id_global — what support quotes
      placedAt: at,
      status: o.status as CustomerOrder["status"],
      total: Number(o.total),
      currency: o.currency,
      shippingStatus: o.shippingStatus,
      trackingUrl: o.shippingTrackingId ? buildTrackingUrl(o.shippingTrackingId) : null,
      fulfilledAt: o.fulfilledAt ? o.fulfilledAt.toISOString() : null,
      refundedAt: o.refundedAt ? o.refundedAt.toISOString() : null,
      chargebackAt: o.chargebackAt ? o.chargebackAt.toISOString() : null,
      refundAmount: o.refundAmount != null ? Number(o.refundAmount) : null,
      chargebackAmount: o.chargebackAmount != null ? Number(o.chargebackAmount) : null,
      saleOrigin: o.saleOrigin,
      platform: origin.label,
      platformKey: origin.key,
      paymentMethod: o.paymentMethod,
      address: o.address,
      items,
    });
  }
  for (const [key, set] of productSet) {
    const row = map.get(key);
    if (row) row.products = [...set];
  }
  for (const [key, plats] of platformSet) {
    const row = map.get(key);
    if (row) {
      row.platforms = [...plats.values()].sort();
      row.platformKeys = [...plats.keys()];
    }
  }
  for (const row of map.values()) {
    row.orders.sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  }

  // fold in app users (adds accounts that may have no orders yet). Canonical
  // customer_id first; unstamped users fall back to the historical rules:
  // email, else the cluster of an order paid with the same phone, else the
  // phone itself, else the user id.
  for (const u of allUsers) {
    let key: string | null = u.customerId ?? null;
    if (!key && u.email) {
      const email = u.email.toLowerCase();
      key = customerByEmail.get(email) ?? `legacy:${email}`;
    }
    if (!key && u.phone) {
      const orderMatch = sorted.find((o) => o.customerPhoneE164 === u.phone && orderKeys.has(o.id));
      key = orderMatch ? orderKeys.get(orderMatch.id)! : `legacy:${u.phone}`;
    }
    if (!key) key = `legacy:${u.id}`;

    const row = get(key);
    // "App" means the customer actually signed in — NOT that a users row
    // exists. "View as" on a lead provisions the account (see
    // /api/admin/impersonate) and must not make the CRM claim adoption.
    if (u.lastLoginAt) row.hasApp = true;
    row.userId = u.id;
    row.onboarded = !!u.onboardedAt;
    row.churnFlag = u.churnFlag;
    if (!row.name && u.fullName) row.name = u.fullName;
    if (!row.phone && u.phone) row.phone = u.phone;
    if (!row.email && u.email) row.email = u.email.toLowerCase();
    const dose = dosesByUser.get(u.id);
    if (dose) {
      row.totalDoses = dose.count;
      row.lastDoseDay = dose.last;
    }
    row.reachable = reachableUsers.has(u.id);
  }

  // Phone-only customers have no email to show — surface the phone instead so
  // the list column is never blank.
  for (const row of map.values()) {
    if (!row.email && row.phone) row.email = row.phone;
  }

  return [...map.values()].sort((a, b) => (b.lastOrderAt ?? "").localeCompare(a.lastOrderAt ?? ""));
}

// In-process cache: the fold reads five whole tables, which is fine once per
// half-minute but not once per keystroke of the admin search box. Invalidated
// by the ingest paths; single-instance deployment (Railway), so a plain
// module-level cache is enough. Best-effort only — a stale 30s window is fine.
const CACHE_TTL_MS = 30_000;
let cache: { at: number; rows: CustomerRow[] } | null = null;

export function invalidateCustomersCache(): void {
  cache = null;
}

export async function loadCustomers(): Promise<CustomerRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;

  const [allOrders, allItems, allUsers, allCustomers, doseAgg, pushRows] = await Promise.all([
    db.query.orders.findMany(),
    db.query.orderItems.findMany(),
    db.query.users.findMany(),
    db.query.customers.findMany(),
    rawSql<DoseAgg[]>`
      SELECT user_id, count(*)::text cnt, max(day)::text last_day FROM dose_logs GROUP BY user_id`,
    rawSql<{ user_id: string }[]>`SELECT DISTINCT user_id FROM push_subscriptions`,
  ]);

  const rows = foldCustomers(allOrders, allItems, allUsers, allCustomers, doseAgg, pushRows.map((r) => r.user_id));
  cache = { at: Date.now(), rows };
  return rows;
}

const digitsOf = (s: string) => s.replace(/\D/g, "");

export function applyFilters(rows: CustomerRow[], f: CustomerFilters): CustomerRow[] {
  return rows.filter((r) => {
    if (f.origin && r.saleOrigin !== f.origin) return false;
    if (f.platform && !r.platformKeys.includes(f.platform)) return false;
    if (f.product && !r.products.includes(f.product)) return false;
    if (f.reachable && !r.reachable) return false;
    if (f.hasApp && !r.hasApp) return false;
    if (f.status === "active" && (r.churnFlag || !r.hasApp)) return false;
    if (f.status === "churned" && !r.churnFlag) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      const qDigits = digitsOf(q);
      // support usually arrives with an order id — or a phone — in hand
      const matches =
        r.email.includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.orders.some((o) => o.number.toLowerCase().includes(q)) ||
        (qDigits.length >= 4 && r.phone != null && digitsOf(r.phone).includes(qDigits));
      if (!matches) return false;
    }
    return true;
  });
}

export function computeStats(rows: CustomerRow[]) {
  const cutoff = Date.now() - 30 * 86400000;
  const byOrigin = new Map<string, number>();
  // Revenue per platform comes off the ORDERS, not the customer: one customer
  // can buy through two merchant accounts and their LTV must not be counted
  // twice (or pinned to whichever account happened to be last).
  const byPlatform = new Map<string, number>();
  let totalRevenue = 0;
  let newCustomers = 0;
  let churned = 0;
  let reachable = 0;
  let appUsers = 0;
  let totalOrders = 0;

  for (const r of rows) {
    totalRevenue += r.totalSpent;
    totalOrders += r.ordersCount;
    if (r.hasApp) appUsers++;
    if (r.reachable) reachable++;
    if (r.churnFlag) churned++;
    if (r.firstOrderAt && new Date(r.firstOrderAt).getTime() >= cutoff) newCustomers++;
    byOrigin.set(r.saleOrigin, (byOrigin.get(r.saleOrigin) ?? 0) + r.totalSpent);
    for (const o of r.orders) {
      if (!REVENUE_STATUSES.has(o.status)) continue;
      byPlatform.set(o.platform, (byPlatform.get(o.platform) ?? 0) + o.total);
    }
  }

  return {
    customers: rows.length,
    appUsers,
    reachable,
    churned,
    newCustomers,
    totalOrders,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    revenueByOrigin: [...byOrigin.entries()]
      .map(([origin, revenue]) => ({ origin, revenue: Math.round(revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue),
    revenueByPlatform: [...byPlatform.entries()]
      .map(([platform, revenue]) => ({ platform, revenue: Math.round(revenue * 100) / 100 }))
      .sort((a, b) => b.revenue - a.revenue),
  };
}

/** Distinct filter options for the UI (origins + products present in the data). */
export function facets(rows: CustomerRow[]) {
  const origins = new Set<string>();
  const products = new Set<string>();
  const platforms = new Map<string, string>(); // key -> label
  for (const r of rows) {
    origins.add(r.saleOrigin);
    r.products.forEach((p) => products.add(p));
    r.orders.forEach((o) => platforms.set(o.platformKey, o.platform));
  }
  return {
    origins: [...origins].sort(),
    products: [...products].sort(),
    platforms: [...platforms.entries()]
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}
