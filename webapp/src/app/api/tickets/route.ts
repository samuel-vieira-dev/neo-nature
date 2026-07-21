import { desc, eq } from "drizzle-orm";
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

  const { subject, orderNumber, kind, description } = parsed.data;
  const id = `T-${Math.floor(2200 + Math.random() * 700)}`;

  // 1) Persist the local mirror first — we must never lose the customer's message,
  //    even if Freshdesk is down or not yet configured.
  const [row] = await db
    .insert(tickets)
    .values({
      id,
      userId: user.id,
      subject,
      orderNumber,
      kind,
      email: user.email,
      lastMessage:
        kind === "refund"
          ? "Refund received — we'll process it within 48 hours. You can keep the bottle."
          : "Our team will get back to you by email within 24 hours.",
    })
    .returning();

  // 2) Push to Freshdesk (system of record). Failure degrades gracefully:
  //    the ticket stays local with sync_status so ops can reconcile.
  const result = await createFreshdeskTicket({ email: user.email, subject, description, kind, orderNumber });
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
