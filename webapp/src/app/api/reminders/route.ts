import { asc, and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reminders } from "@/db/schema";
import { withUser } from "@/server/session";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

export const GET = withUser(async (user) => {
  const rows = await db.query.reminders.findMany({
    where: eq(reminders.userId, user.id),
    orderBy: [asc(reminders.time)],
  });
  return Response.json({ reminders: rows });
});

const createSchema = z.object({
  time: z.string().regex(timeRegex),
  habitAnchor: z.string().max(120).nullish(),
});

export const POST = withUser(async (user, request: Request) => {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const [row] = await db
    .insert(reminders)
    .values({ userId: user.id, time: parsed.data.time, habitAnchor: parsed.data.habitAnchor ?? null })
    .returning();
  return Response.json({ ok: true, reminder: row });
});

const patchSchema = z.object({
  id: z.number(),
  time: z.string().regex(timeRegex).optional(),
  habitAnchor: z.string().max(120).nullish().optional(),
  enabled: z.boolean().optional(),
});

export const PATCH = withUser(async (user, request: Request) => {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const { id, ...fields } = parsed.data;
  await db
    .update(reminders)
    .set(fields)
    .where(and(eq(reminders.id, id), eq(reminders.userId, user.id)));
  return Response.json({ ok: true });
});

const deleteSchema = z.object({ id: z.number() });

export const DELETE = withUser(async (user, request: Request) => {
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  await db
    .delete(reminders)
    .where(and(eq(reminders.id, parsed.data.id), eq(reminders.userId, user.id)));
  return Response.json({ ok: true });
});
