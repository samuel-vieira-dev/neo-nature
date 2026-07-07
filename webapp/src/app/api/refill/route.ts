import { z } from "zod";
import { db } from "@/db";
import { orders, orderItems, invoices } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow, addDays } from "@/server/time";
import { notifyUser } from "@/server/push";
import { productById } from "@/lib/data";

const schema = z.object({
  productId: z.string(),
  upsellProductIds: z.array(z.string()).max(3).default([]),
});

const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/** One-tap refill — simulated checkout (BuyGoods handles the real charge in Phase 2) */
export const POST = withUser(async (user, request: Request) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const main = productById(parsed.data.productId);
  if (!main) return Response.json({ error: "unknown_product" }, { status: 400 });
  const upsells = parsed.data.upsellProductIds
    .map((id) => productById(id))
    .filter((p): p is NonNullable<typeof p> => !!p);

  const now = appNow(user);
  const number = `NN-${Math.floor(10500 + Math.random() * 900)}`;
  const id = `${user.id}-${number.toLowerCase()}`;
  const items = [main, ...upsells];
  const total = items.reduce((sum, p) => sum + p.price, 0);

  await db.insert(orders).values({
    id,
    userId: user.id,
    number,
    placedAt: now,
    status: "processing",
    total: total.toFixed(2),
    eta: fmt(addDays(now, 5)),
    carrier: "USPS",
    trackingNumber: null,
    address: user.address,
    trackingSteps: [
      { label: "Order confirmed", detail: "We received your order", date: fmt(now), done: true, current: true },
      { label: "Preparing your package", detail: "Fulfillment center — Dallas, TX", date: "", done: false },
      { label: "Shipped", detail: "", date: "", done: false },
      { label: "In transit", detail: "", date: "", done: false },
      { label: "Out for delivery", detail: "", date: "", done: false },
      { label: "Delivered", detail: "", date: "", done: false },
    ],
  });

  await db.insert(orderItems).values(
    items.map((p) => ({ orderId: id, productId: p.id, qty: 1, price: p.price.toFixed(2) }))
  );

  await db.insert(invoices).values({
    userId: user.id,
    amount: total.toFixed(2),
    cardDescriptor: `NEONATURE*ORDER 855-201-4437`,
    status: "paid",
    chargedAt: now,
    orderNumber: number,
  });

  await notifyUser(user.id, {
    title: "Refill on the way! 📦",
    body: `Order ${number} confirmed — ${items.map((p) => p.name).join(" + ")} arrives ~${fmt(addDays(now, 5))}. The chain stays unbroken.`,
    icon: "package",
    url: `/orders/${id}`,
  });

  return Response.json({ ok: true, orderId: id, number, total });
});
