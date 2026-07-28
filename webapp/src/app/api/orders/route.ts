import { desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, type Order, type User } from "@/db/schema";
import { withUser } from "@/server/session";

type Item = typeof orderItems.$inferSelect;

// Orders are matched to the signed-in user by userId (once linked), OR by
// email/phone (for orders that arrived via BuyGoods before/without linking —
// SMS-only accounts have no email, so phone is the only key in that case).
export function userOrdersCondition(user: Pick<User, "id" | "email" | "phone">) {
  const conditions = [eq(orders.userId, user.id)];
  if (user.email) conditions.push(eq(orders.email, user.email.toLowerCase()));
  if (user.phone) conditions.push(eq(orders.customerPhoneE164, user.phone));
  return conditions.length > 1 ? or(...conditions) : conditions[0];
}

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

export const GET = withUser(async (user) => {
  const rows = await db.query.orders.findMany({
    where: userOrdersCondition(user),
    orderBy: [desc(orders.placedAt)],
  });
  const items = rows.length
    ? await db.query.orderItems.findMany({ where: inArray(orderItems.orderId, rows.map((o) => o.id)) })
    : [];

  return Response.json({
    orders: rows.map((o) => serializeOrder(o, items.filter((i) => i.orderId === o.id))),
  });
});
