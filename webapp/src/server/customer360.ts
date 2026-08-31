// ---------------------------------------------------------------------------
// Customer 360 — the full profile behind /admin/customers/[id].
//
// loadCustomer() is deliberately JSON-serializable and UI-free: besides the
// admin page it is the future "customer context" API for the AI support agent
// (which is why Freshdesk can be skipped — the agent won't always need it).
// Aggregates are derived here at read time; only identity lives in the
// customers table (see customer-identity.ts).
// ---------------------------------------------------------------------------

import { eq, inArray, or } from "drizzle-orm";
import { db, rawSql } from "@/db";
import { customers, doseLogs, orders, orderItems, tickets, users, type Customer } from "@/db/schema";
import { computeStreak, daysWithoutDose } from "@/server/domain";
import { listFreshdeskTickets, type FreshdeskListResult } from "@/server/freshdesk";
import { groupOrders } from "@/server/order-groups";
import { userToday } from "@/server/time";
import { type CustomerOrder } from "@/server/crm";
import { buildTrackingUrl } from "@/lib/tracking";
import { purchaseOriginOf } from "@/server/sales-platform";

export type Customer360 = {
  id: string;
  name: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  createdAt: string;
  /** Every distinct identity observed across orders + app accounts. */
  emails: string[];
  phones: string[];
  buygoodsPairs: { accountId: string; userId: string }[];
  // KPIs
  ordersCount: number;
  totalSpent: number;
  refundedTotal: number;
  chargebackTotal: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  /** Purchase groups (upsells folded), newest first; members newest-anchor order. */
  purchases: { anchor: CustomerOrder; addOns: CustomerOrder[]; groupTotal: number }[];
  /** One entry per linked app account (normally 0 or 1). */
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
  /** Null when the caller asked to skip the live lookup (?freshdesk=0). */
  freshdesk: FreshdeskListResult | null;
};

const REVENUE_STATUSES = new Set(["confirmed", "shipped"]);

/** Follows merged_into_id tombstones to the surviving row (bounded). */
async function resolveMergeChain(id: string): Promise<Customer | null> {
  let row = await db.query.customers.findFirst({ where: eq(customers.id, id) });
  for (let hops = 0; row?.mergedIntoId && hops < 5; hops++) {
    row = await db.query.customers.findFirst({ where: eq(customers.id, row.mergedIntoId) });
  }
  return row ?? null;
}

export async function loadCustomer(
  id: string,
  opts: { freshdesk?: boolean } = {}
): Promise<Customer360 | null> {
  const customer = await resolveMergeChain(id);
  if (!customer) return null;

  const [customerOrders, linkedUsers] = await Promise.all([
    db.query.orders.findMany({ where: eq(orders.customerId, customer.id) }),
    db.query.users.findMany({ where: eq(users.customerId, customer.id) }),
  ]);
  customerOrders.sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());

  const orderIds = customerOrders.map((o) => o.id);
  const items = orderIds.length
    ? await db.query.orderItems.findMany({ where: inArray(orderItems.orderId, orderIds) })
    : [];
  const itemsByOrder = new Map<string, CustomerOrder["items"]>();
  for (const it of items) {
    const arr = itemsByOrder.get(it.orderId) ?? [];
    arr.push({ productName: it.productName, sku: it.sku, qty: it.qty, price: Number(it.price) });
    itemsByOrder.set(it.orderId, arr);
  }

  // ---- identity facets -----------------------------------------------------
  const emails = new Set<string>();
  const phones = new Set<string>();
  const pairs = new Map<string, { accountId: string; userId: string }>();
  if (customer.primaryEmail) emails.add(customer.primaryEmail);
  if (customer.primaryPhone) phones.add(customer.primaryPhone);
  for (const o of customerOrders) {
    if (o.email) emails.add(o.email.toLowerCase());
    if (o.customerPhoneE164) phones.add(o.customerPhoneE164);
    if (o.buygoodsAccountId && o.buygoodsUserId)
      pairs.set(`${o.buygoodsAccountId}:${o.buygoodsUserId}`, {
        accountId: o.buygoodsAccountId,
        userId: o.buygoodsUserId,
      });
  }
  for (const u of linkedUsers) {
    if (u.email) emails.add(u.email.toLowerCase());
    if (u.phone) phones.add(u.phone);
  }

  // ---- purchases (upsell folding, same rules the customer app uses) --------
  const toCustomerOrder = (o: (typeof customerOrders)[number]): CustomerOrder => {
    const origin = purchaseOriginOf(o);
    return {
      id: o.id,
      number: o.buygoodsOrderId ?? o.number,
      placedAt: o.placedAt.toISOString(),
      status: o.status as CustomerOrder["status"],
      total: Number(o.total),
      currency: o.currency,
      shippingStatus: o.shippingStatus,
      trackingUrl: o.shippingTrackingId ? buildTrackingUrl(o.shippingTrackingId) : null,
      fulfilledAt: o.fulfilledAt?.toISOString() ?? null,
      refundedAt: o.refundedAt?.toISOString() ?? null,
      chargebackAt: o.chargebackAt?.toISOString() ?? null,
      refundAmount: o.refundAmount != null ? Number(o.refundAmount) : null,
      chargebackAmount: o.chargebackAmount != null ? Number(o.chargebackAmount) : null,
      saleOrigin: o.saleOrigin,
      platform: origin.label,
      platformKey: origin.key,
      paymentMethod: o.paymentMethod,
      address: o.address,
      items: itemsByOrder.get(o.id) ?? [],
    };
  };
  const purchases = groupOrders(customerOrders)
    .map((g) => {
      const anchor = toCustomerOrder(g.anchor);
      const addOns = g.members.filter((m) => m.id !== g.anchor.id).map(toCustomerOrder);
      const groupTotal = anchor.total + addOns.reduce((s, o) => s + o.total, 0);
      return { anchor, addOns, groupTotal };
    })
    .sort((a, b) => b.anchor.placedAt.localeCompare(a.anchor.placedAt));

  // ---- KPIs ----------------------------------------------------------------
  let totalSpent = 0;
  let refundedTotal = 0;
  let chargebackTotal = 0;
  for (const o of customerOrders) {
    if (REVENUE_STATUSES.has(o.status)) totalSpent += Number(o.total);
    if (o.refundAmount != null) refundedTotal += Number(o.refundAmount);
    if (o.chargebackAmount != null) chargebackTotal += Number(o.chargebackAmount);
  }
  const placedDesc = customerOrders.map((o) => o.placedAt.toISOString());

  // ---- engagement per linked app account -----------------------------------
  const userIds = linkedUsers.map((u) => u.id);
  const doseRows = userIds.length
    ? await db.query.doseLogs.findMany({
        where: inArray(doseLogs.userId, userIds),
        columns: { userId: true, day: true },
      })
    : [];
  const daysByUser = new Map<string, string[]>();
  for (const d of doseRows) {
    const arr = daysByUser.get(d.userId) ?? [];
    arr.push(d.day);
    daysByUser.set(d.userId, arr);
  }
  const pushUsers = userIds.length
    ? await rawSql<{ user_id: string }[]>`SELECT DISTINCT user_id FROM push_subscriptions WHERE user_id IN ${rawSql(userIds)}`
    : [];
  const reachable = new Set(pushUsers.map((r) => r.user_id));

  const accounts = linkedUsers.map((u) => {
    const days = daysByUser.get(u.id) ?? [];
    const today = userToday(u);
    const lastDoseDay = days.length ? [...days].sort().at(-1)! : null;
    return {
      userId: u.id,
      hasApp: !!u.lastLoginAt,
      onboarded: !!u.onboardedAt,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      memberSince: u.memberSince?.toISOString() ?? null,
      niche: u.niche,
      motivation: u.motivation,
      churnFlag: u.churnFlag,
      streak: computeStreak(days, today),
      bestStreak: u.bestStreak,
      freezes: u.freezes,
      totalDoses: days.length,
      lastDoseDay,
      daysWithoutDose: lastDoseDay ? daysWithoutDose(lastDoseDay, today) : null,
      reachable: reachable.has(u.id),
      prefs: u.prefs,
    };
  });

  // ---- support -------------------------------------------------------------
  const emailList = [...emails];
  const ticketConds = [
    userIds.length ? inArray(tickets.userId, userIds) : null,
    emailList.length ? inArray(tickets.email, emailList) : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);
  const localTicketRows = ticketConds.length
    ? await db.query.tickets.findMany({
        where: ticketConds.length > 1 ? or(...ticketConds) : ticketConds[0],
      })
    : [];
  localTicketRows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const freshdesk: FreshdeskListResult | null =
    opts.freshdesk === false ? null : await listFreshdeskTickets(emailList);

  return {
    id: customer.id,
    name: customer.name,
    primaryEmail: customer.primaryEmail,
    primaryPhone: customer.primaryPhone,
    createdAt: customer.createdAt.toISOString(),
    emails: emailList,
    phones: [...phones],
    buygoodsPairs: [...pairs.values()],
    ordersCount: customerOrders.length,
    totalSpent: Math.round(totalSpent * 100) / 100,
    refundedTotal: Math.round(refundedTotal * 100) / 100,
    chargebackTotal: Math.round(chargebackTotal * 100) / 100,
    firstOrderAt: placedDesc.at(-1) ?? null,
    lastOrderAt: placedDesc[0] ?? null,
    purchases,
    accounts,
    localTickets: localTicketRows.map((t) => ({
      id: t.id,
      subject: t.subject,
      kind: t.kind,
      status: t.status,
      orderNumber: t.orderNumber,
      syncStatus: t.syncStatus,
      freshdeskId: t.freshdeskId,
      createdAt: t.createdAt.toISOString(),
    })),
    freshdesk,
  };
}
