// ---------------------------------------------------------------------------
// Support desk (/admin/support) — the CS-facing operational view: a unified
// ticket queue, orders (not customers), and a slim customer search. Deliberately
// carries no revenue numbers (see PLANO-CS-DESK.md §1/§6).
//
// Reuses crm.ts's loadCustomers()/applyFilters() for the customer search and
// freshdesk.ts's listRecentFreshdeskTickets() for the ticket queue; orders get
// their own SQL here (paginated, not the whole-table fold crm.ts does).
// ---------------------------------------------------------------------------

import { and, count, desc, eq, gte, ilike, isNotNull, isNull, lt, ne, or } from "drizzle-orm";
import { db, rawSql } from "@/db";
import { customers, orders, tickets } from "@/db/schema";
import { applyFilters, loadCustomers, type CustomerRow } from "@/server/crm";
import {
  listRecentFreshdeskTickets,
  type FreshdeskTicketWithRequester,
} from "@/server/freshdesk";
import { buildTrackingUrl, humanizeStatus } from "@/lib/tracking";
import { purchaseOriginOf } from "@/server/sales-platform";

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** An order counts as "awaiting shipment" past this many days unfulfilled. */
const AWAITING_SHIPMENT_DAYS = 5;
const AWAITING_SHIPMENT_MS = AWAITING_SHIPMENT_DAYS * 86_400_000;
const CHARGEBACK_WINDOW_MS = 7 * 86_400_000;

/** Pure — same 5-day rule used by both getSupportStats (SQL) and getOrdersDesk
 *  (SQL) below; exported so it's unit-testable in one place. */
export function isAwaitingShipment(
  order: { status: string; fulfilledAt: Date | null; placedAt: Date },
  now: Date = new Date()
): boolean {
  return order.status === "confirmed" && order.fulfilledAt === null && order.placedAt.getTime() < now.getTime() - AWAITING_SHIPMENT_MS;
}

// --------------------------------- tickets ----------------------------------

export type SupportTicket = {
  id: number | string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  requester: { name: string | null; email: string | null; phone: string | null };
  customerId: string | null;
  customerName: string | null;
  fromApp: boolean;
  kind: "support" | "refund" | "billing" | null;
};

export type TicketQueueResult = {
  source: "freshdesk" | "local";
  warning: string | null;
  tickets: SupportTicket[];
  truncated: boolean;
};

export type TicketQueueFilters = {
  status?: string;
  q?: string;
  kind?: "support" | "refund" | "billing";
  priority?: string;
  /** Inclusive, YYYY-MM-DD, compared against updatedAt from 00:00:00.000 UTC that day. */
  updatedFrom?: string;
  /** Inclusive, YYYY-MM-DD, compared against updatedAt up to 23:59:59.999 UTC that day. */
  updatedTo?: string;
  /** Case-insensitive; drops tickets whose status is any of these. Used by the
   *  stat-card links, whose counters are defined as "not resolved/closed"
   *  rather than one single status (see getSupportStats' openTickets and
   *  refundRequests) — a plain `status` equality can't express that. */
  excludeStatus?: string[];
};

/**
 * Pure — filters an already-loaded ticket queue in memory. All date filters
 * operate on `updatedAt`, compared in UTC. Extracted so the filtering logic
 * (used by getTicketQueue) is unit-testable without the Freshdesk/db calls.
 */
export function filterTicketQueue(list: SupportTicket[], opts: TicketQueueFilters): SupportTicket[] {
  let out = list;
  if (opts.status) {
    const s = opts.status.toLowerCase();
    out = out.filter((t) => t.status.toLowerCase() === s);
  }
  if (opts.excludeStatus?.length) {
    const excluded = new Set(opts.excludeStatus.map((s) => s.toLowerCase()));
    out = out.filter((t) => !excluded.has(t.status.toLowerCase()));
  }
  if (opts.kind) {
    out = out.filter((t) => t.kind === opts.kind);
  }
  if (opts.priority) {
    const p = opts.priority.toLowerCase();
    out = out.filter((t) => t.priority.toLowerCase() === p);
  }
  if (opts.updatedFrom) {
    const from = new Date(`${opts.updatedFrom}T00:00:00.000Z`).getTime();
    if (!Number.isNaN(from)) out = out.filter((t) => new Date(t.updatedAt).getTime() >= from);
  }
  if (opts.updatedTo) {
    const to = new Date(`${opts.updatedTo}T23:59:59.999Z`).getTime();
    if (!Number.isNaN(to)) out = out.filter((t) => new Date(t.updatedAt).getTime() <= to);
  }
  if (opts.q) {
    const needle = opts.q.toLowerCase();
    out = out.filter(
      (t) =>
        t.subject.toLowerCase().includes(needle) ||
        (t.requester.email ?? "").toLowerCase().includes(needle) ||
        (t.requester.name ?? "").toLowerCase().includes(needle) ||
        (t.customerName ?? "").toLowerCase().includes(needle)
    );
  }
  return out;
}

/** Pure — indexes the customer list for O(1) requester→customer matching. */
export function buildCustomerIndexes(rows: CustomerRow[]): {
  byEmail: Map<string, CustomerRow>;
  byPhoneDigits: Map<string, CustomerRow>;
} {
  const byEmail = new Map<string, CustomerRow>();
  const byPhoneDigits = new Map<string, CustomerRow>();
  for (const r of rows) {
    if (!r.id) continue; // legacy fallback rows have no customer id to link to
    if (r.email) byEmail.set(r.email.toLowerCase(), r);
    if (r.phone) {
      const d = digitsOf(r.phone);
      if (d.length >= 7) byPhoneDigits.set(d, r);
    }
  }
  return { byEmail, byPhoneDigits };
}

/** Pure — matches a Freshdesk requester to a customer by email, else phone digits. */
export function matchCustomerForRequester(
  requester: { email?: string | null; phone?: string | null },
  byEmail: Map<string, CustomerRow>,
  byPhoneDigits: Map<string, CustomerRow>
): CustomerRow | null {
  const email = requester.email?.toLowerCase().trim();
  if (email && byEmail.has(email)) return byEmail.get(email)!;
  const digits = requester.phone ? digitsOf(requester.phone) : "";
  if (digits.length >= 7 && byPhoneDigits.has(digits)) return byPhoneDigits.get(digits)!;
  return null;
}

// In-process cache of the raw Freshdesk recent-tickets result. Five minutes,
// not seconds: a support queue does not need to be real-time, and each miss
// costs up to ten calls against the client's live helpdesk, which rate-limits
// (429) per minute. Single-instance deployment (Railway); best-effort only.
const TICKET_CACHE_TTL_MS = 5 * 60_000;
type RecentTicketsResult = Awaited<ReturnType<typeof listRecentFreshdeskTickets>>;
let ticketCache: { at: number; result: RecentTicketsResult } | null = null;
/** Last result that actually carried tickets — served when a refresh fails. */
let lastGoodTickets: { at: number; result: Extract<RecentTicketsResult, { ok: true }> } | null = null;

async function getRecentTicketsCached(): Promise<RecentTicketsResult> {
  if (ticketCache && Date.now() - ticketCache.at < TICKET_CACHE_TTL_MS) return ticketCache.result;
  const result = await listRecentFreshdeskTickets({ sinceDays: 90 });
  ticketCache = { at: Date.now(), result };
  if (result.ok) {
    lastGoodTickets = { at: Date.now(), result };
    return result;
  }
  // A transient failure (rate limit, blip) should not blank the queue while a
  // recent good copy is still in memory.
  if (lastGoodTickets && Date.now() - lastGoodTickets.at < 30 * 60_000) return lastGoodTickets.result;
  return result;
}

const LOCAL_STATUS_LABELS: Record<string, string> = { open: "Open", in_review: "Pending", resolved: "Resolved" };

/**
 * Unified ticket queue. Freshdesk (last 90 days, all requesters) is the
 * primary source; each row is matched to a customer (email, then phone) and
 * cross-referenced against the local mirror by freshdeskId for the "App"
 * badge + ticket kind. Falls back to the local mirror when Freshdesk isn't
 * configured or the live call fails.
 */
export async function getTicketQueue(opts: TicketQueueFilters = {}): Promise<TicketQueueResult> {
  const [fd, customerRows, localTicketRows] = await Promise.all([
    getRecentTicketsCached(),
    loadCustomers(),
    db.query.tickets.findMany(),
  ]);

  let source: "freshdesk" | "local";
  let warning: string | null = null;
  let list: SupportTicket[];
  const truncated = fd.ok ? fd.truncated : false;

  if (fd.ok) {
    source = "freshdesk";
    const { byEmail, byPhoneDigits } = buildCustomerIndexes(customerRows);
    const localByFreshdeskId = new Map(
      localTicketRows.filter((t) => t.freshdeskId != null).map((t) => [t.freshdeskId as number, t])
    );
    list = (fd.tickets as FreshdeskTicketWithRequester[]).map((t) => {
      const customer = matchCustomerForRequester(t.requester, byEmail, byPhoneDigits);
      const local = localByFreshdeskId.get(t.id);
      return {
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        url: t.url,
        requester: t.requester,
        customerId: customer?.id ?? null,
        customerName: customer?.name || null,
        fromApp: !!local,
        kind: local ? (local.kind as SupportTicket["kind"]) : null,
      };
    });
  } else {
    source = "local";
    warning = "Showing app tickets only — Freshdesk unavailable";
    const byUserId = new Map(customerRows.filter((r) => r.userId).map((r) => [r.userId as string, r]));
    const domain = process.env.FRESHDESK_DOMAIN;
    list = localTicketRows.map((t) => {
      const customer = t.userId ? byUserId.get(t.userId) ?? null : null;
      const createdAt = t.createdAt.toISOString();
      return {
        id: t.freshdeskId ?? t.id,
        subject: t.subject,
        status: LOCAL_STATUS_LABELS[t.status] ?? t.status,
        priority: "—",
        createdAt,
        updatedAt: createdAt, // the local mirror has no separate updated_at column
        url: t.freshdeskId && domain ? `https://${domain}.freshdesk.com/a/tickets/${t.freshdeskId}` : "",
        requester: { name: customer?.name ?? null, email: t.email || null, phone: null },
        customerId: customer?.id ?? null,
        customerName: customer?.name || null,
        fromApp: true,
        kind: t.kind as SupportTicket["kind"],
      };
    });
  }

  list = filterTicketQueue(list, opts);
  list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return { source, warning, tickets: list, truncated };
}

// ---------------------------------- orders ----------------------------------

export type SupportOrder = {
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

export type OrdersDeskResult = { total: number; offset: number; limit: number; orders: SupportOrder[] };

const DEFAULT_ORDERS_LIMIT = 50;
const MAX_ORDERS_LIMIT = 200;
const MIN_PHONE_QUERY_DIGITS = 4; // matches crm.ts's applyFilters threshold

export async function getOrdersDesk(opts: {
  status?: string;
  problem?: "awaiting" | "refund" | "chargeback";
  q?: string;
  offset?: number;
  limit?: number;
}): Promise<OrdersDeskResult> {
  const offset = Math.max(0, opts.offset ?? 0);
  const limit = Math.min(MAX_ORDERS_LIMIT, Math.max(1, opts.limit ?? DEFAULT_ORDERS_LIMIT));

  const conditions = [];
  if (opts.status) conditions.push(eq(orders.status, opts.status));
  if (opts.problem === "awaiting") {
    conditions.push(
      and(eq(orders.status, "confirmed"), isNull(orders.fulfilledAt), lt(orders.placedAt, new Date(Date.now() - AWAITING_SHIPMENT_MS)))
    );
  } else if (opts.problem === "refund") {
    conditions.push(isNotNull(orders.refundedAt));
  } else if (opts.problem === "chargeback") {
    conditions.push(isNotNull(orders.chargebackAt));
  }
  if (opts.q) {
    const q = opts.q.trim();
    const digits = digitsOf(q);
    const qConds = [
      ilike(orders.number, `%${q}%`),
      ilike(orders.buygoodsOrderId, `%${q}%`),
      ilike(orders.email, `%${q}%`),
      ilike(orders.customerName, `%${q}%`),
    ];
    if (digits.length >= MIN_PHONE_QUERY_DIGITS) qConds.push(ilike(orders.customerPhoneE164, `%${digits}%`));
    conditions.push(or(...qConds));
  }
  const where = conditions.length ? and(...conditions) : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select({ order: orders, customer: customers })
      .from(orders)
      .leftJoin(customers, eq(orders.customerId, customers.id))
      .where(where)
      .orderBy(desc(orders.placedAt))
      .limit(limit)
      .offset(offset),
    db.select({ n: count() }).from(orders).where(where),
  ]);

  const list: SupportOrder[] = rows.map(({ order: o, customer: c }) => {
    const origin = purchaseOriginOf(o);
    return {
      id: o.id,
      number: o.buygoodsOrderId ?? o.number,
      placedAt: o.placedAt.toISOString(),
      status: o.status,
      customerId: o.customerId ?? c?.id ?? null,
      customerName: c?.name || o.customerName,
      email: o.email,
      phone: o.customerPhoneE164 ?? o.customerPhone ?? null,
      productName: o.productName,
      shippingStatus: o.shippingStatus,
      shippingStatusLabel: o.shippingStatus ? humanizeStatus(o.shippingStatus) : null,
      trackingUrl: o.shippingTrackingId ? buildTrackingUrl(o.shippingTrackingId) : null,
      fulfilledAt: o.fulfilledAt ? o.fulfilledAt.toISOString() : null,
      platform: origin.label,
      address: o.address,
      refunded: !!o.refundedAt,
      chargeback: !!o.chargebackAt,
      edited: (o.lockedFields ?? []).length > 0,
      lockedFields: o.lockedFields ?? [],
    };
  });

  return { total: totalRows[0]?.n ?? 0, offset, limit, orders: list };
}

// --------------------------------- customers ---------------------------------

export type SupportCustomer = {
  id: string | null;
  name: string;
  email: string;
  phone: string | null;
  lastOrder: {
    id: string;
    number: string;
    status: string;
    shippingStatusLabel: string | null;
    trackingUrl: string | null;
    placedAt: string;
  } | null;
  openTickets: number;
  hasRefund: boolean;
  hasChargeback: boolean;
  hasApp: boolean;
};

const DEFAULT_CUSTOMERS_LIMIT = 50;
const SEARCH_CUSTOMERS_LIMIT = 200;

/** Pure — projects a CRM row down to what CS needs (no LTV/attribution/engagement). */
export function projectSupportCustomer(row: CustomerRow, openTickets: number): SupportCustomer {
  const last = row.orders[0] ?? null; // crm.ts's foldCustomers sorts orders newest-first
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    lastOrder: last
      ? {
          id: last.id,
          number: last.number,
          status: last.status,
          shippingStatusLabel: last.shippingStatus ? humanizeStatus(last.shippingStatus) : null,
          trackingUrl: last.trackingUrl,
          placedAt: last.placedAt,
        }
      : null,
    openTickets,
    hasRefund: row.orders.some((o) => !!o.refundedAt),
    hasChargeback: row.orders.some((o) => !!o.chargebackAt),
    hasApp: row.hasApp,
  };
}

export async function searchCustomersDesk(q?: string): Promise<SupportCustomer[]> {
  const rows = await loadCustomers();
  const filtered = q ? applyFilters(rows, { q }) : rows;
  // No typed search: the 50 customers with the most recent order (rows are
  // already sorted that way — see crm.ts). A search can return more since
  // it's a deliberate lookup, not a browse list.
  const limited = filtered.slice(0, q ? SEARCH_CUSTOMERS_LIMIT : DEFAULT_CUSTOMERS_LIMIT);

  const ticketCounts = await rawSql<{ user_id: string | null; email: string; cnt: string }[]>`
    SELECT user_id, email, count(*)::text cnt FROM tickets WHERE status <> 'resolved' GROUP BY 1, 2`;
  const byUserId = new Map<string, number>();
  const byEmail = new Map<string, number>();
  for (const r of ticketCounts) {
    const n = Number(r.cnt);
    if (r.user_id) byUserId.set(r.user_id, (byUserId.get(r.user_id) ?? 0) + n);
    if (r.email) {
      const key = r.email.toLowerCase();
      byEmail.set(key, (byEmail.get(key) ?? 0) + n);
    }
  }

  return limited.map((row) => {
    const openTickets = (row.userId ? byUserId.get(row.userId) : undefined) ?? (row.email ? byEmail.get(row.email.toLowerCase()) : undefined) ?? 0;
    return projectSupportCustomer(row, openTickets);
  });
}

// ----------------------------------- stats -----------------------------------

export type SupportStats = {
  openTickets: number;
  awaitingShipment: number;
  refundRequests: number;
  chargebacks7d: number;
  source: "freshdesk" | "local";
  ticketsTruncated: boolean;
};

/**
 * openTickets and refundRequests are derived from the SAME ticket queue the
 * Tickets tab shows (getTicketQueue), so the stat card and the list never
 * disagree. In the local fallback (Freshdesk unavailable) they instead count
 * straight from the local `tickets` table mirror, same as before.
 */
export async function getSupportStats(): Promise<SupportStats> {
  const [queue, refundRequestsLocalRows, awaitingRows, chargebackRows] = await Promise.all([
    getTicketQueue(),
    db
      .select({ n: count() })
      .from(tickets)
      .where(and(eq(tickets.kind, "refund"), ne(tickets.status, "resolved"))),
    db
      .select({ n: count() })
      .from(orders)
      .where(and(eq(orders.status, "confirmed"), isNull(orders.fulfilledAt), lt(orders.placedAt, new Date(Date.now() - AWAITING_SHIPMENT_MS)))),
    db
      .select({ n: count() })
      .from(orders)
      .where(gte(orders.chargebackAt, new Date(Date.now() - CHARGEBACK_WINDOW_MS))),
  ]);

  let openTickets: number;
  let refundRequests: number;
  if (queue.source === "freshdesk") {
    openTickets = queue.tickets.filter((t) => t.status === "Open" || t.status === "Pending").length;
    refundRequests = queue.tickets.filter((t) => t.kind === "refund" && t.status !== "Resolved" && t.status !== "Closed").length;
  } else {
    const localOpenRows = await db.select({ n: count() }).from(tickets).where(ne(tickets.status, "resolved"));
    openTickets = localOpenRows[0]?.n ?? 0;
    refundRequests = refundRequestsLocalRows[0]?.n ?? 0;
  }

  return {
    openTickets,
    awaitingShipment: awaitingRows[0]?.n ?? 0,
    refundRequests,
    chargebacks7d: chargebackRows[0]?.n ?? 0,
    source: queue.source,
    ticketsTruncated: queue.truncated,
  };
}
