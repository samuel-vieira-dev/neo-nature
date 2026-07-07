import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, type Order } from "@/db/schema";
import { withUser } from "@/server/session";

export function serializeOrder(o: Order, items: { productId: string; qty: number; price: string }[]) {
  return {
    id: o.id,
    number: o.number,
    date: o.placedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    status: o.status,
    total: Number(o.total),
    eta: o.eta,
    carrier: o.carrier,
    trackingNumber: o.trackingNumber,
    address: o.address,
    tracking: o.trackingSteps,
    items: items.map((i) => ({ productId: i.productId, qty: i.qty, price: Number(i.price) })),
  };
}

export const GET = withUser(async (user) => {
  const rows = await db.query.orders.findMany({
    where: eq(orders.userId, user.id),
    orderBy: [desc(orders.placedAt)],
  });
  const items = rows.length
    ? await db.query.orderItems.findMany({ where: inArray(orderItems.orderId, rows.map((o) => o.id)) })
    : [];

  return Response.json({
    orders: rows.map((o) => serializeOrder(o, items.filter((i) => i.orderId === o.id))),
  });
});
