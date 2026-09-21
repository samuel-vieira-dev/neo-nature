import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders } from "@/db/schema";

export const purchaseLinkSchema = z.object({
  orderId: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email().max(320)),
});

export async function findPurchase(orderId: string, email: string) {
  return db.query.orders.findFirst({
    where: and(
      or(eq(orders.id, orderId), eq(orders.buygoodsOrderId, orderId), eq(orders.konnektiveOrderId, orderId), eq(orders.number, orderId)),
      sql`lower(trim(${orders.email})) = ${email}`,
    ),
    orderBy: [desc(orders.placedAt)],
  });
}
