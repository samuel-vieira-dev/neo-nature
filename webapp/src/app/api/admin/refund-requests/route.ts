import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { withAdmin, logAdminAction } from "@/server/admin";
export const GET = withAdmin(async (_admin, req: Request) => {
  const params = new URL(req.url).searchParams;
  const page = Math.max(0, Math.min(100000, Number(params.get("page")) || 0));
  const status = params.get("status");
  const where = and(isNotNull(tickets.refundResponse), status ? eq(tickets.refundReviewStatus, status) : undefined);
  const [rows, [count]] = await Promise.all([
    db.select({ id: tickets.id, userId: tickets.userId, orderNumber: tickets.orderNumber, email: tickets.email, createdAt: tickets.createdAt, status: tickets.refundReviewStatus, notes: tickets.refundNotes, response: tickets.refundResponse, syncStatus: tickets.syncStatus, freshdeskId: tickets.freshdeskId }).from(tickets).where(where).orderBy(desc(tickets.createdAt), desc(tickets.id)).limit(25).offset(Math.floor(page) * 25),
    db.select({ total: sql<number>`count(*)::int` }).from(tickets).where(where),
  ]);
  return Response.json({ requests: rows, total: count.total });
}, "customers:read");
const update = z.object({ id: z.string().max(64), status: z.enum(["new", "in_review", "awaiting_customer", "closed"]), notes: z.string().max(8000) });
export const PATCH = withAdmin(async (admin, req: Request) => {
  const parsed = update.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { id, status, notes } = parsed.data;
  const [row] = await db.update(tickets).set({ refundReviewStatus: status, refundNotes: notes }).where(and(eq(tickets.id, id), isNotNull(tickets.refundResponse))).returning({ userId: tickets.userId });
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  await logAdminAction(admin, "refund_request.reviewed", { targetUserId: row.userId, metadata: { ticketId: id, status } });
  return Response.json({ ok: true });
}, "tickets:write");
