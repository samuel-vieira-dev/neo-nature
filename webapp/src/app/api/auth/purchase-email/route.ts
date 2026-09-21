import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { withUser, linkSession, createLinkSession } from "@/server/session";
import { makeLimiter } from "@/server/rate-limit";

const limiter = makeLimiter({ max: 5, windowMs: 15 * 60 * 1000 });
const schema = z.object({ email: z.string().trim().toLowerCase().pipe(z.email().max(320)) });
export const GET = withUser(async () => {
  const session = await linkSession();
  return Response.json({ required: !!session && !session.confirmed }, { headers: { "Cache-Control": "private, no-store" } });
});
export const POST = withUser(async (user, request: Request) => {
  const session = await linkSession();
  if (!session) return Response.json({ ok: true });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!limiter.hit(`${ip}|${user.id}`).allowed) return Response.json({ error: "too_many_attempts" }, { status: 429 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  const order = await db.query.orders.findFirst({ where: eq(orders.id, session.orderId) });
  if (!parsed.success || !order || order.userId !== user.id || order.email?.trim().toLowerCase() !== parsed.data.email)
    return Response.json({ error: "invalid_email" }, { status: 403 });
  await createLinkSession(user.id, order.id, true);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
});
