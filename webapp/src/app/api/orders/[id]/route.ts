import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems } from "@/db/schema";
import { withUser } from "@/server/session";
import { serializeOrder } from "../route";

export const GET = withUser(async (user, _req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const order = await db.query.orders.findFirst({
    where: and(eq(orders.id, id), eq(orders.userId, user.id)),
  });
  if (!order) return Response.json({ error: "not_found" }, { status: 404 });

  const items = await db.query.orderItems.findMany({ where: eq(orderItems.orderId, order.id) });
  return Response.json({ order: serializeOrder(order, items) });
});
