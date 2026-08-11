import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { withUser } from "@/server/session";
import { createFreshdeskTicket } from "@/server/freshdesk";

const createSchema = z.object({
  subject: z.string().min(2).max(200),
  orderNumber: z.string().max(40).default("—"),
  kind: z.enum(["support", "refund", "billing"]).default("support"),
  description: z.string().max(4000).optional(),
  // Idempotency key: same submission intent retried => same ticket, one Freshdesk push.
  clientRequestId: z.string().min(8).max(64).optional(),
});

const serialize = (t: typeof tickets.$inferSelect) => ({
  id: t.id,
  subject: t.subject,
  orderNumber: t.orderNumber,
  kind: t.kind,
  status: t.status,
  lastMessage: t.lastMessage,
  date: t.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
});

/**
 * Mints the next ticket id. `tickets.id` is the global primary key, so it must
 * be unique across every user — a DB sequence gives us that atomically, even
 * with concurrent requests. Keeps the customer-facing "T-####" display format
 * (it shows up in our copy and in Freshdesk ticket descriptions).
 */
async function nextTicketId() {
  const [row] = await db.execute<{ n: string }>(sql`select nextval('ticket_id_seq') as n`);
  return `T-${row.n}`;
}

export const GET = withUser(async (user) => {
  const rows = await db.query.tickets.findMany({
    where: eq(tickets.userId, user.id),
    orderBy: [desc(tickets.createdAt)],
  });
  return Response.json({ tickets: rows.map(serialize) });
});

export const POST = withUser(async (user, request: Request) => {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const { subject, orderNumber, kind, description, clientRequestId } = parsed.data;
  const id = await nextTicketId();

  // 1) Persist the local mirror first — we must never lose the customer's message,
  //    even if Freshdesk is down or not yet configured.
  //
  //    ON CONFLICT on the idempotency key is what makes a burst of taps safe: the
  //    losing requests insert nothing and return the ticket the winner created,
  //    so step 2 below (the Freshdesk push) runs exactly once per intent. A null
  //    clientRequestId never conflicts, so callers without one behave as before.
  const [inserted] = await db
    .insert(tickets)
    .values({
      id,
      userId: user.id,
      subject,
      orderNumber,
      kind,
      email: user.email || user.phone || "",
      clientRequestId,
      lastMessage:
        kind === "refund"
          ? "Refund request received — we'll analyze it within 48 hours and send further instructions"
          : "Our team usually replies by email within an hour.",
    })
    .onConflictDoNothing({ target: tickets.clientRequestId })
    .returning();

  if (!inserted) {
    const existing = await db.query.tickets.findFirst({
      where: eq(tickets.clientRequestId, clientRequestId!),
    });
    // The key is a client-minted UUID, so this should always be the same
    // customer — but never hand back another account's ticket if it isn't.
    if (!existing || existing.userId !== user.id) {
      return Response.json({ error: "duplicate_request" }, { status: 409 });
    }
    return Response.json({ ok: true, ticket: serialize(existing), deduped: true });
  }

  const row = inserted;

  // 2) Push to Freshdesk (system of record). Failure degrades gracefully:
  //    the ticket stays local with sync_status so ops can reconcile.
  // SMS-only customers have no email — Freshdesk falls back to phone + name.
  const result = await createFreshdeskTicket({
    email: user.email || undefined,
    phone: user.phone || undefined,
    name: user.fullName || user.name || undefined,
    subject,
    description,
    kind,
    orderNumber,
  });
  if (result.ok) {
    await db
      .update(tickets)
      .set({ freshdeskId: result.freshdeskId, syncStatus: "synced" })
      .where(eq(tickets.id, id));
  } else if (result.reason === "not_configured") {
    await db.update(tickets).set({ syncStatus: "local_only" }).where(eq(tickets.id, id));
  }
  // on api_error we leave syncStatus = "pending" for a future retry/reconcile

  return Response.json({ ok: true, ticket: serialize({ ...row, syncStatus: result.ok ? "synced" : row.syncStatus }) });
});
