import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { orders, orderItems, bottles } from "@/db/schema";
import { withUser, isDemoMode } from "@/server/session";
import { appNow } from "@/server/time";
import { notifyUser } from "@/server/push";
import { productById } from "@/lib/data";

/**
 * Demo event: marks the user's most recent undelivered order as delivered
 * and refreshes the active bottle when the delivery contains the protocol
 * product.
 */
export const POST = withUser(async (user) => {
  if (!isDemoMode()) return Response.json({ error: "not_available" }, { status: 403 });

  const order = await db.query.orders.findFirst({
    where: and(eq(orders.userId, user.id), ne(orders.status, "delivered")),
    orderBy: [desc(orders.placedAt)],
  });
  if (!order) return Response.json({ error: "no_undelivered_order" }, { status: 404 });

  const now = appNow(user);
  const dateLabel = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const steps = order.trackingSteps.map((s) => ({
    ...s,
    done: true,
    current: false,
    date: s.date || dateLabel,
  }));
  steps[steps.length - 1] = { ...steps[steps.length - 1], detail: "Left at front door", current: true };

  await db.update(orders).set({ status: "delivered", trackingSteps: steps, eta: null }).where(eq(orders.id, order.id));

  // if the delivery contains the user's protocol product, a fresh bottle starts
  const items = await db.query.orderItems.findMany({ where: eq(orderItems.orderId, order.id) });
  const activeBottle = await db.query.bottles.findFirst({
    where: and(eq(bottles.userId, user.id), eq(bottles.active, true)),
  });
  const refillItem = items.find((i) => i.productId === activeBottle?.productId);
  if (refillItem && activeBottle) {
    const product = productById(refillItem.productId)!;
    await db.update(bottles).set({ active: false }).where(eq(bottles.id, activeBottle.id));
    await db.insert(bottles).values({
      userId: user.id,
      productId: product.id,
      capsules: product.capsules,
      dosePerDay: product.dosePerDay,
      openedAt: now,
    });
  }

  await notifyUser(user.id, {
    title: "Delivered! 📦",
    body: `Order ${order.number} just arrived at your door.`,
    icon: "package",
    url: `/orders/${order.id}`,
  });

  return Response.json({ ok: true, orderId: order.id });
});
