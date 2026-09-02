import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { withUser } from "@/server/session";
import { createTicketForUser, serializeTicket } from "@/server/tickets";

const createSchema = z.object({
  subject: z.string().min(2).max(200),
  orderNumber: z.string().max(40).default("—"),
  kind: z.enum(["support", "refund", "billing"]).default("support"),
  description: z.string().max(4000).optional(),
  // Idempotency key: same submission intent retried => same ticket, one Freshdesk push.
  clientRequestId: z.string().min(8).max(64).optional(),
});

export const GET = withUser(async (user) => {
  const rows = await db.query.tickets.findMany({
    where: eq(tickets.userId, user.id),
    orderBy: [desc(tickets.createdAt)],
  });
  return Response.json({ tickets: rows.map(serializeTicket) });
});

export const POST = withUser(async (user, request: Request) => {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const { subject, orderNumber, kind, description, clientRequestId } = parsed.data;

  const result = await createTicketForUser({
    userId: user.id,
    email: user.email,
    phone: user.phone,
    name: user.fullName || user.name,
    subject,
    description,
    kind,
    orderNumber,
    clientRequestId,
  });

  if (!result.ok) return Response.json({ error: result.error }, { status: 409 });
  return Response.json({ ok: true, ticket: result.ticket, ...(result.deduped ? { deduped: true } : {}) });
});
