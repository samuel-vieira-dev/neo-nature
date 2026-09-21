import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, users } from "@/db/schema";
import { findOrProvisionAccount } from "@/server/leads";
import { createLinkSession, destroySession, REFUND_COOKIE } from "@/server/session";
import { cookies } from "next/headers";
import { findPurchase, purchaseLinkSchema } from "@/server/purchase-access";
import { makeLimiter } from "@/server/rate-limit";

const limiter = makeLimiter({ max: 20, windowMs: 15 * 60 * 1000 });
export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirect = (path: string) => {
    // Keep the browser's public origin: Railway exposes an internal host in request.url.
    const response = new Response(null, { status: 303, headers: { Location: path } });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  // Never leave a previous customer's session active after a failed account switch.
  await destroySession();
  (await cookies()).delete(REFUND_COOKIE);
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!limiter.hit(ip).allowed) return redirect("/access-error");
  const parsed = purchaseLinkSchema.safeParse({
    orderId: url.searchParams.get("order_id"),
    email: url.searchParams.get("email"),
    name: url.searchParams.get("name") ?? undefined,
  });
  if (!parsed.success) return redirect("/access-error");
  const order = await findPurchase(parsed.data.orderId, parsed.data.email);
  if (!order) return redirect("/access-error");
  const existing = order.userId ? await db.query.users.findFirst({ where: eq(users.id, order.userId) }) : null;
  const resolved = existing ? { user: existing } : await findOrProvisionAccount({ email: order.email, phone: order.customerPhoneE164 });
  if (!resolved) return redirect("/access-error");
  // Attach only the validated purchase. Do not relink other orders during login.
  if (!order.userId) await db.update(orders).set({ userId: resolved.user.id }).where(eq(orders.id, order.id));
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, resolved.user.id));
  if (parsed.data.name) await createLinkSession(resolved.user.id, order.id, false, parsed.data.name);
  else await createLinkSession(resolved.user.id, order.id);
  return redirect("/");
}
