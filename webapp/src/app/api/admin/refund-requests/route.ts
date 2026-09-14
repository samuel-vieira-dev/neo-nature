import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { refundRequests, tickets, users } from "@/db/schema";
import { EMAIL_FIELD, NAME_FIELD, ORDER_FIELD } from "@/lib/refund/form";
import { withAdmin, logAdminAction } from "@/server/admin";

export const GET = withAdmin(async (_admin, req: Request) => {
  const params = new URL(req.url).searchParams;
  const page = Math.max(0, Math.min(100000, Number(params.get("page")) || 0));
  const status = params.get("status");
  const outcome = params.get("outcome");
  const where = and(status ? eq(refundRequests.reviewStatus, status) : undefined, outcome ? eq(refundRequests.outcome, outcome) : undefined);
  const [rows, [count]] = await Promise.all([
    db.select({
      id: refundRequests.id, userId: refundRequests.userId, ticketId: refundRequests.ticketId,
      userEmail: users.email, userName: users.fullName, fallbackName: users.name,
      createdAt: refundRequests.createdAt, updatedAt: refundRequests.updatedAt, submittedAt: refundRequests.submittedAt,
      status: refundRequests.reviewStatus, notes: refundRequests.notes,
      formVersion: refundRequests.formVersion, form: refundRequests.formDefinition,
      answers: refundRequests.answers, currentPageId: refundRequests.currentPageId, outcome: refundRequests.outcome,
      syncStatus: tickets.syncStatus, freshdeskId: tickets.freshdeskId,
    }).from(refundRequests).innerJoin(users, eq(users.id, refundRequests.userId)).leftJoin(tickets, eq(tickets.id, refundRequests.ticketId))
      .where(where).orderBy(desc(refundRequests.updatedAt), desc(refundRequests.id)).limit(25).offset(page * 25),
    db.select({ total: sql<number>`count(*)::int` }).from(refundRequests).where(where),
  ]);
  return Response.json({ requests: rows.map(row => ({
    id: row.id, userId: row.userId, ticketId: row.ticketId,
    email: row.answers[EMAIL_FIELD] || row.userEmail || "", name: row.answers[NAME_FIELD] || row.userName || row.fallbackName || "",
    orderNumber: row.answers[ORDER_FIELD] || "—", createdAt: row.createdAt, updatedAt: row.updatedAt, submittedAt: row.submittedAt,
    status: row.status, notes: row.notes,
    response: { version: row.formVersion, form: row.form, answers: row.answers, outcome: row.outcome, endPage: row.currentPageId },
    syncStatus: row.ticketId ? row.syncStatus : "not_sent", freshdeskId: row.freshdeskId,
  })), total: count.total });
}, "customers:read");

const update = z.object({ id: z.string().min(1).max(100), status: z.enum(["new", "in_review", "awaiting_customer", "closed"]), notes: z.string().max(8000) });
export const PATCH = withAdmin(async (admin, req: Request) => {
  const parsed = update.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { id, status, notes } = parsed.data;
  const [row] = await db.update(refundRequests).set({ reviewStatus: status, notes, updatedAt: new Date() }).where(eq(refundRequests.id, id)).returning({ userId: refundRequests.userId, ticketId: refundRequests.ticketId });
  if (!row) return Response.json({ error: "not_found" }, { status: 404 });
  if (row.ticketId) await db.update(tickets).set({ refundReviewStatus: status, refundNotes: notes }).where(eq(tickets.id, row.ticketId));
  await logAdminAction(admin, "refund_request.reviewed", { targetUserId: row.userId, metadata: { requestId: id, ticketId: row.ticketId, status } });
  return Response.json({ ok: true });
}, "tickets:write");
