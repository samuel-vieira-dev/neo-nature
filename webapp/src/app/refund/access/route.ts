import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { orders, users } from "@/db/schema";
import { linkOrdersToUser } from "@/server/buygoods";
import { findOrProvisionAccount } from "@/server/leads";
import { verifyRefundLinkToken } from "@/server/refund-link";
import { createRefundSession } from "@/server/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const publicOrigin = process.env.PUBLIC_APP_URL || (process.env.NODE_ENV === "production" ? "https://app.beneonature.com" : url.origin);
  const orderId = await verifyRefundLinkToken(url.searchParams.get("token") ?? "");
  const invalid = () => NextResponse.redirect(new URL("/refund?error=invalid", publicOrigin));
  if (!orderId) return invalid();
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) });
  if (!order) return invalid();

  const existing = order.userId ? await db.query.users.findFirst({ where: eq(users.id, order.userId) }) : null;
  const resolved = existing ? { user: existing } : await findOrProvisionAccount({ email: order.email, phone: order.customerPhoneE164 });
  if (!resolved) return invalid();
  await linkOrdersToUser(resolved.user.id, { email: order.email, phone: order.customerPhoneE164 });
  if (!order.userId) await db.update(orders).set({ userId: resolved.user.id }).where(eq(orders.id, order.id));
  await createRefundSession(resolved.user.id, order.id);
  const response = NextResponse.redirect(new URL("/refund", publicOrigin));
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
