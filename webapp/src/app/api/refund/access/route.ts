import { and, desc, eq, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, users } from "@/db/schema";
import { linkOrdersToUser } from "@/server/buygoods";
import { findOrProvisionAccount } from "@/server/leads";
import { makeLimiter } from "@/server/rate-limit";
import { createRefundSession } from "@/server/session";

const limiter = makeLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
const schema = z.object({ orderId: z.string().trim().min(1).max(100), email: z.email().max(320) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_details" }, { status: 400 });
  const orderId = parsed.data.orderId.trim();
  const email = parsed.data.email.toLowerCase().trim();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = limiter.hit(`${ip}|${orderId.toLowerCase()}`);
  if (!limit.allowed) return Response.json({ error: "too_many_attempts", retryAfterSec: limit.retryAfterSec }, { status: 429 });

  const order = await db.query.orders.findFirst({
    where: and(
      or(eq(orders.id, orderId), eq(orders.buygoodsOrderId, orderId), eq(orders.konnektiveOrderId, orderId), eq(orders.number, orderId)),
      sql`lower(${orders.email}) = ${email}`,
    ),
    orderBy: [desc(orders.placedAt)],
  });
  if (!order) return Response.json({ error: "invalid_details" }, { status: 401 });

  const existing = order.userId ? await db.query.users.findFirst({ where: eq(users.id, order.userId) }) : null;
  const resolved = existing ? { user: existing } : await findOrProvisionAccount({ email: order.email, phone: order.customerPhoneE164 });
  if (!resolved) return Response.json({ error: "invalid_details" }, { status: 401 });
  await linkOrdersToUser(resolved.user.id, { email: order.email, phone: order.customerPhoneE164 });
  if (!order.userId) await db.update(orders).set({ userId: resolved.user.id }).where(eq(orders.id, order.id));
  await createRefundSession(resolved.user.id, order.id);
  limiter.reset(`${ip}|${orderId.toLowerCase()}`);
  return Response.json({ ok: true, redirect: "/refund" }, { headers: { "Cache-Control": "private, no-store" } });
}
