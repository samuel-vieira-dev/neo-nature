import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, type Order } from "@/db/schema";
import { withUser } from "@/server/session";

type Item = typeof orderItems.$inferSelect;

export function serializeOrder(o: Order, items: Item[]) {
  return {
    id: o.id,
    number: o.number,
    date: o.placedAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    status: o.status as "confirmed" | "shipped" | "canceled" | "refunded",
    total: Number(o.total),
    currency: o.currency,
    shippingStatus: o.shippingStatus,
    address: o.address,
    tracking: o.trackingSteps,
    items: items.map((i) => ({
      productName: i.productName,
      sku: i.sku,
      thumbnailUrl: i.thumbnailUrl,
      qty: i.qty,
      price: Number(i.price),
    })),
  };
}

// Orders are matched to the signed-in user by email (they may have been created
// by a BuyGoods webhook before the account existed).
export const GET = withUser(async (user) => {
  const rows = await db.query.orders.findMany({
    where: eq(orders.email, user.email.toLowerCase()),
    orderBy: [desc(orders.placedAt)],
  });
  const items = rows.length
    ? await db.query.orderItems.findMany({ where: inArray(orderItems.orderId, rows.map((o) => o.id)) })
    : [];

  return Response.json({
    orders: rows.map((o) => serializeOrder(o, items.filter((i) => i.orderId === o.id))),
  });
});
