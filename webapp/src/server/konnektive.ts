import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, users } from "@/db/schema";
import { notifyUser } from "@/server/push";
import { hydrateUserFromOrders } from "@/server/buygoods";
import type { NormalizedOrder, KonnektiveItem, OrderStatus } from "@/server/konnektive-parse";

// Ingestion half of the Konnektive integration. The payload parsing lives in
// konnektive-parse.ts, which stays free of DB imports so it can be unit-tested
// against real captures without a database.
export * from "@/server/konnektive-parse";

function buildTrackingSteps(status: OrderStatus, placed: Date, fulfilledAt: Date | null, shippingStatus: string | undefined) {
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  if (status === "canceled") {
    return [
      { label: "Order confirmed", detail: "", date: fmt(placed), done: true },
      { label: "Order canceled", detail: "This order was canceled.", date: "", done: true, current: true },
    ];
  }
  if (status === "refunded") {
    return [
      { label: "Order confirmed", detail: "", date: fmt(placed), done: true },
      { label: "Refunded", detail: "Your refund has been processed.", date: "", done: true, current: true },
    ];
  }
  const shipped = status === "shipped";
  return [
    { label: "Order confirmed", detail: "We received your order", date: fmt(placed), done: true },
    { label: "Payment received", detail: "", date: fmt(placed), done: true },
    { label: "Preparing your order", detail: "", date: "", done: shipped, current: !shipped },
    {
      label: "Shipped",
      detail: shipped ? (shippingStatus || "On its way") : "",
      date: shipped && fulfilledAt ? fmt(fulfilledAt) : "",
      done: shipped,
      current: shipped,
    },
  ];
}

export type IngestResult =
  | { ok: true; status: "created" | "updated"; orderId: string }
  | { ok: false; reason: string };

/**
 * Upserts an order from a normalized Konnektive payload. Idempotent by
 * clientOrderId, so the proxy backfill and the live direct feed converge on one
 * row no matter which arrives first or how often either repeats.
 */
export async function ingestKonnektiveOrder(o: NormalizedOrder): Promise<IngestResult> {
  // Link to an app account if one exists — phone first (customers sign in with
  // the phone they bought with), email as the fallback, same as BuyGoods.
  const user =
    (o.customerPhoneE164
      ? await db.query.users.findFirst({ where: eq(users.phone, o.customerPhoneE164), columns: { id: true } })
      : null) ??
    (o.email ? await db.query.users.findFirst({ where: eq(users.email, o.email), columns: { id: true } }) : null);

  const attribution = {
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerPhoneE164: o.customerPhoneE164,
    affiliate: o.affiliate,
    trafficSource: o.trafficSource,
    funnel: o.funnel,
    subid: o.subid,
    paymentMethod: o.paymentMethod,
    saleOrigin: o.saleOrigin,
  };
  const trackingSteps = buildTrackingSteps(o.status, o.placedAt, o.fulfilledAt, o.shippingStatus);

  const existing = await db.query.orders.findFirst({ where: eq(orders.konnektiveOrderId, o.clientOrderId) });

  if (existing) {
    await db
      .update(orders)
      .set({
        userId: existing.userId ?? user?.id ?? null,
        email: existing.email || o.email,
        status: o.status,
        total: o.total,
        currency: o.currency,
        shippingStatus: o.shippingStatus ?? existing.shippingStatus,
        shippingTrackingId: o.shippingTrackingId ?? existing.shippingTrackingId,
        fulfilledAt: o.fulfilledAt ?? existing.fulfilledAt,
        address: o.address || existing.address,
        trackingSteps,
        ...attribution,
      })
      .where(eq(orders.id, existing.id));

    // The direct feed carries no items[]; only fill them in if the order has
    // none yet, so a fulfillment event can't wipe the lines the proxy sent.
    if (o.items.length > 0) {
      const hasItems = await db.query.orderItems.findFirst({
        where: eq(orderItems.orderId, existing.id),
        columns: { id: true },
      });
      if (!hasItems) {
        await db.insert(orderItems).values(o.items.map((it) => itemRow(existing.id, it)));
      }
    }

    const ownerId = existing.userId ?? user?.id;
    if (ownerId) await hydrateUserFromOrders(ownerId);

    // Notify on the first transition into "shipped" only — and never on a
    // backfill, or replaying a week of orders would push every customer a
    // "shipped" alert for a parcel that arrived days ago.
    if (o.status === "shipped" && existing.status !== "shipped" && ownerId && !o.isReplay) {
      await notifyUser(ownerId, {
        title: "Your order shipped! 📦",
        body: `Order ${existing.number} is on its way.`,
        icon: "package",
        url: `/orders/${existing.id}`,
      });
    }
    return { ok: true, status: "updated", orderId: existing.id };
  }

  const id = `kn-${o.clientOrderId}`;
  await db.insert(orders).values({
    id,
    source: "konnektive",
    konnektiveOrderId: o.clientOrderId,
    userId: user?.id ?? null,
    email: o.email,
    number: o.number,
    placedAt: o.placedAt,
    status: o.status,
    total: o.total,
    currency: o.currency,
    shippingStatus: o.shippingStatus,
    shippingTrackingId: o.shippingTrackingId,
    fulfilledAt: o.fulfilledAt,
    address: o.address,
    trackingSteps,
    ...attribution,
  });

  if (o.items.length > 0) {
    await db.insert(orderItems).values(o.items.map((it) => itemRow(id, it)));
  }

  if (user?.id) await hydrateUserFromOrders(user.id);

  if (o.status === "shipped" && user?.id && !o.isReplay) {
    await notifyUser(user.id, {
      title: "Your order shipped! 📦",
      body: `Order ${o.number} is on its way.`,
      icon: "package",
      url: `/orders/${id}`,
    });
  }

  return { ok: true, status: "created", orderId: id };
}

function itemRow(orderId: string, it: KonnektiveItem) {
  return {
    orderId,
    productCodename: it.productId,
    productName: it.name,
    sku: it.sku,
    qty: it.qty,
    price: it.price,
  };
}
