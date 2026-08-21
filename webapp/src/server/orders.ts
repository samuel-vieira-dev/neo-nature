import { desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, type Order, type User } from "@/db/schema";
import { buildTrackingUrl } from "@/lib/tracking";
import { groupOrders, groupStatus, groupTotal, groupTrackingId, isAddOn, isAddOnCodename, type OrderGroup } from "@/server/order-groups";

type Item = typeof orderItems.$inferSelect;

// ---------------------------------------------------------------------------
// Customer-facing order reads. Everything the app shows a customer about their
// orders goes through here: which rows are theirs, how upsell/downsell rows
// fold into one purchase (order-groups.ts), and what "has it arrived?" means.
// ---------------------------------------------------------------------------

/**
 * Orders are matched to the signed-in user by userId (once linked), OR by
 * email/phone (for orders that arrived via BuyGoods before/without linking —
 * SMS-only accounts have no email, so phone is the only key in that case).
 */
export function userOrdersCondition(user: Pick<User, "id" | "email" | "phone">) {
  const conditions = [eq(orders.userId, user.id)];
  if (user.email) conditions.push(eq(orders.email, user.email.toLowerCase()));
  if (user.phone) conditions.push(eq(orders.customerPhoneE164, user.phone));
  return conditions.length > 1 ? or(...conditions) : conditions[0];
}

/** How long after shipping we stop assuming a parcel is still on its way. */
export const ASSUME_DELIVERED_AFTER_MS = 21 * 24 * 60 * 60 * 1000;

const DELIVERED_RE = /\bdelivered\b/i;

/** The carrier/feed told us the parcel was handed over. */
export function isDelivered(o: Pick<Order, "shippingStatus" | "trackingSteps">): boolean {
  if (o.shippingStatus && DELIVERED_RE.test(o.shippingStatus)) return true;
  return (o.trackingSteps ?? []).some((s) => s.done && (DELIVERED_RE.test(s.label) || DELIVERED_RE.test(s.detail)));
}

/**
 * "Has the customer got this in hand yet?" — no while the order is confirmed
 * or in transit; yes once the feed says delivered, or after 21 days in
 * transit with no delivery event (most carriers never send one, and the
 * onboarding can't wait on a parcel that arrived weeks ago).
 */
export function isAwaitingArrival(
  o: Pick<Order, "status" | "shippingStatus" | "trackingSteps" | "fulfilledAt" | "placedAt">,
  now: Date = new Date()
): boolean {
  if (o.status === "confirmed") return true;
  if (o.status !== "shipped") return false;
  if (isDelivered(o)) return false;
  const shippedAt = o.fulfilledAt ?? o.placedAt;
  return now.getTime() - shippedAt.getTime() < ASSUME_DELIVERED_AFTER_MS;
}

export type SerializedOrder = ReturnType<typeof serializeOrderGroup>;

/** One customer-facing order = one purchase group (main order + its upsells/downsells). */
export function serializeOrderGroup(group: OrderGroup<Order>, items: Item[], now: Date = new Date()) {
  const { anchor, members } = group;
  const status = groupStatus(group);
  // Timeline from whichever member carries the group's status (the anchor
  // unless it ended and a live sibling took over).
  const timelineSource = anchor.status === status ? anchor : (members.find((m) => m.status === status) ?? anchor);
  const trackingId = groupTrackingId(group);
  const number = anchor.buygoodsOrderId ?? anchor.number;

  return {
    id: anchor.id,
    // BuyGoods' order_id_global — the id support and suppliers work with. The
    // numeric order_id stays on the row (o.number) for cross-referencing.
    number,
    // Ids of the folded upsell/downsell orders, so support can find them.
    bundledNumbers: members.filter((m) => m.id !== anchor.id).map((m) => m.buygoodsOrderId ?? m.number),
    memberIds: members.map((m) => m.id),
    date: anchor.placedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    placedAt: anchor.placedAt.toISOString(),
    status,
    total: Number(groupTotal(group).toFixed(2)),
    currency: anchor.currency,
    shippingStatus: timelineSource.shippingStatus ?? anchor.shippingStatus,
    trackingId,
    trackingUrl: trackingId ? buildTrackingUrl(trackingId) : null,
    address: anchor.address,
    tracking: timelineSource.trackingSteps,
    delivered: members.some((m) => m.status === "shipped" && isDelivered(m)),
    awaitingArrival: members.some((m) => isAwaitingArrival(m, now)),
    items: members.flatMap((m) => {
      const own = items.filter((i) => i.orderId === m.id);
      const rows = own.length
        ? own.map((i) => ({
            productName: i.productName,
            sku: i.sku,
            thumbnailUrl: i.thumbnailUrl,
            qty: i.qty,
            price: Number(i.price),
            // Konnektive has no flag; its upsell lines are named "… - Upsell 1" / "… - Downsell".
            addOn: isAddOn(m) || isAddOnCodename(i.productCodename) || /\b(upsell|downsell)\b/i.test(i.productName),
          }))
        : // Some feeds (Konnektive direct) carry no line items — fall back to
          // the headline product so the purchase still shows what was bought.
          m.productName
          ? [{ productName: m.productName, sku: null, thumbnailUrl: null, qty: 1, price: Number(m.total), addOn: isAddOn(m) }]
          : [];
      return rows.map((r) => ({
        ...r,
        orderNumber: m.buygoodsOrderId ?? m.number,
        // Surfaces "refunded"/"canceled" on a single add-on line when the rest
        // of the purchase is still live.
        status: m.status as "confirmed" | "shipped" | "canceled" | "refunded",
      }));
    }),
  };
}

/** Every purchase of the signed-in user, newest first, upsells folded in. */
export async function loadUserOrders(user: Pick<User, "id" | "email" | "phone">, now: Date = new Date()) {
  const rows = await db.query.orders.findMany({
    where: userOrdersCondition(user),
    orderBy: [desc(orders.placedAt)],
  });
  const items = rows.length
    ? await db.query.orderItems.findMany({ where: inArray(orderItems.orderId, rows.map((o) => o.id)) })
    : [];

  return groupOrders(rows)
    .map((g) => serializeOrderGroup(g, items, now))
    .sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

/** One purchase by any of its member ids (a folded upsell's id resolves to its parent purchase). */
export async function loadUserOrder(user: Pick<User, "id" | "email" | "phone">, id: string, now: Date = new Date()) {
  const all = await loadUserOrders(user, now);
  return all.find((o) => o.id === id || o.memberIds.includes(id)) ?? null;
}
