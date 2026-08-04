import { db, rawSql } from "@/db";

// ---------------------------------------------------------------------------
// CRM aggregation. A "customer" is keyed by email and unifies BuyGoods orders
// with the app account (if any). Powers the admin customer list, the top-line
// stats, and the push-audience resolver — all from one source so filters match.
// ---------------------------------------------------------------------------

export type CustomerOrder = {
  id: string;
  number: string;
  placedAt: string;
  status: "confirmed" | "shipped" | "canceled" | "refunded";
  total: number;
  currency: string;
  shippingStatus: string | null;
  fulfilledAt: string | null;
  saleOrigin: string;
  paymentMethod: string | null;
  address: string;
  items: { productName: string; sku: string | null; qty: number; price: number }[];
};

export type CustomerRow = {
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
  reachable: boolean; // has at least one push subscription
  userId: string | null;
  orders: CustomerOrder[];
};

export type CustomerFilters = {
  origin?: string;
  product?: string;
  status?: "active" | "churned" | "all";
  reachable?: boolean;
  hasApp?: boolean;
  q?: string;
};

const REVENUE_STATUSES = new Set(["confirmed", "shipped"]);

export async function loadCustomers(): Promise<CustomerRow[]> {
  const [allOrders, allItems, allUsers, doseAgg, pushRows] = await Promise.all([
    db.query.orders.findMany(),
    db.query.orderItems.findMany(),
    db.query.users.findMany(),
    rawSql<{ user_id: string; cnt: string; last_day: string | null }[]>`
      SELECT user_id, count(*)::text cnt, max(day)::text last_day FROM dose_logs GROUP BY user_id`,
    rawSql<{ user_id: string }[]>`SELECT DISTINCT user_id FROM push_subscriptions`,
  ]);

  const itemsByOrder = new Map<string, CustomerOrder["items"]>();
  for (const it of allItems) {
    const arr = itemsByOrder.get(it.orderId) ?? [];
    arr.push({ productName: it.productName, sku: it.sku, qty: it.qty, price: Number(it.price) });
    itemsByOrder.set(it.orderId, arr);
  }
  const dosesByUser = new Map(doseAgg.map((d) => [d.user_id, { count: Number(d.cnt), last: d.last_day }]));
  const reachableUsers = new Set(pushRows.map((r) => r.user_id));

  const map = new Map<string, CustomerRow>();
  const get = (key: string): CustomerRow => {
    key = key.toLowerCase();
    let row = map.get(key);
    if (!row) {
      row = {
        email: key, name: "", phone: null, ordersCount: 0, totalSpent: 0,
        firstOrderAt: null, lastOrderAt: null, saleOrigin: "Direct", products: [],
        hasApp: false, onboarded: false, lastDoseDay: null, totalDoses: 0,
        churnFlag: false, reachable: false, userId: null, orders: [],
      };
      map.set(key, row);
    }
    return row;
  };

  // fold in orders (sorted so lastOrder wins for saleOrigin/name)
  const sorted = [...allOrders].sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime());
  const productSet = new Map<string, Set<string>>();
  for (const o of sorted) {
    if (!o.email) continue;
    const row = get(o.email);
    row.ordersCount += 1;
    if (REVENUE_STATUSES.has(o.status)) row.totalSpent += Number(o.total);
    const at = o.placedAt.toISOString();
    row.firstOrderAt = row.firstOrderAt ?? at;
    row.lastOrderAt = at;
    if (o.customerName) row.name = o.customerName;
    if (o.customerPhone) row.phone = o.customerPhone;
    row.saleOrigin = o.saleOrigin || row.saleOrigin;
    const items = itemsByOrder.get(o.id) ?? [];
    const set = productSet.get(row.email) ?? new Set<string>();
    for (const it of items) if (it.productName) set.add(it.productName);
    productSet.set(row.email, set);
    row.orders.push({
      id: o.id,
      number: o.number,
      placedAt: at,
      status: o.status as CustomerOrder["status"],
      total: Number(o.total),
      currency: o.currency,
      shippingStatus: o.shippingStatus,
      fulfilledAt: o.fulfilledAt ? o.fulfilledAt.toISOString() : null,
      saleOrigin: o.saleOrigin,
      paymentMethod: o.paymentMethod,
      address: o.address,
      items,
    });
  }
  for (const [email, set] of productSet) {
    const row = map.get(email);
    if (row) row.products = [...set];
  }
  for (const row of map.values()) {
    row.orders.sort((a, b) => b.placedAt.localeCompare(a.placedAt));
  }

  // fold in app users (adds accounts that may have no orders yet). Matched by
  // email primarily; SMS-only accounts (no email) instead join the cluster of
  // whichever BuyGoods order was paid with the same phone number — falling
  // back to the phone itself as the cluster key when no such order exists.
  for (const u of allUsers) {
    let key: string | null = u.email ? u.email.toLowerCase() : null;
    if (!key && u.phone) {
      const orderMatch = sorted.find((o) => o.customerPhoneE164 === u.phone);
      key = orderMatch ? orderMatch.email.toLowerCase() : u.phone;
    }
    if (!key) key = u.id;

    const row = get(key);
    row.hasApp = true;
    row.userId = u.id;
    row.onboarded = !!u.onboardedAt;
    row.churnFlag = u.churnFlag;
    if (!row.name && u.fullName) row.name = u.fullName;
    if (!row.phone && u.phone) row.phone = u.phone;
    const dose = dosesByUser.get(u.id);
    if (dose) {
      row.totalDoses = dose.count;
      row.lastDoseDay = dose.last;
    }
    row.reachable = reachableUsers.has(u.id);
  }

  return [...map.values()].sort((a, b) => (b.lastOrderAt ?? "").localeCompare(a.lastOrderAt ?? ""));
}

export function applyFilters(rows: CustomerRow[], f: CustomerFilters): CustomerRow[] {
  return rows.filter((r) => {
    if (f.origin && r.saleOrigin !== f.origin) return false;
    if (f.product && !r.products.includes(f.product)) return false;
    if (f.reachable && !r.reachable) return false;
    if (f.hasApp && !r.hasApp) return false;
    if (f.status === "active" && (r.churnFlag || !r.hasApp)) return false;
    if (f.status === "churned" && !r.churnFlag) return false;
    if (f.q) {
      const q = f.q.toLowerCase();
      if (!r.email.includes(q) && !r.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export function computeStats(rows: CustomerRow[]) {
  const cutoff = Date.now() - 30 * 86400000;
  const byOrigin = new Map<string, number>();
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
  };
}

/** Distinct filter options for the UI (origins + products present in the data). */
export function facets(rows: CustomerRow[]) {
  const origins = new Set<string>();
  const products = new Set<string>();
  for (const r of rows) {
    origins.add(r.saleOrigin);
    r.products.forEach((p) => products.add(p));
  }
  return { origins: [...origins].sort(), products: [...products].sort() };
}
