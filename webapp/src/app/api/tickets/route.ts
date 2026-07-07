import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { withUser } from "@/server/session";

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

  const id = `T-${Math.floor(2200 + Math.random() * 700)}`;
  const [row] = await db
    .insert(tickets)
    .values({
      id,
      userId: user.id,
      subject: parsed.data.subject,
      orderNumber: parsed.data.orderNumber,
      kind: parsed.data.kind,
      lastMessage:
        parsed.data.kind === "refund"
          ? "Refund received — we'll process it within 48 hours. You can keep the bottle."
          : "Our team will get back to you within 24 hours.",
    })
    .returning();

  return Response.json({ ok: true, ticket: serialize(row) });
});
