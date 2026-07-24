import { desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { banners } from "@/db/schema";
import { withAdmin } from "@/server/admin";

export const GET = withAdmin(async () => {
  const rows = await db.query.banners.findMany({ orderBy: [desc(banners.id)] });
  return Response.json({ banners: rows });
});

const createSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(300),
  ctaLabel: z.string().max(40).nullish(),
  ctaUrl: z.string().max(200).nullish(),
  active: z.boolean().default(false),
});

export const POST = withAdmin(async (_admin, req: Request) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const [row] = await db.insert(banners).values(parsed.data).returning();
  if (row.active) await db.update(banners).set({ active: false }).where(ne(banners.id, row.id));
  return Response.json({ ok: true, banner: row });
});

const patchSchema = z.object({
  id: z.number(),
  title: z.string().min(1).max(120).optional(),
  body: z.string().min(1).max(300).optional(),
  ctaLabel: z.string().max(40).nullish().optional(),
  ctaUrl: z.string().max(200).nullish().optional(),
  active: z.boolean().optional(),
});

export const PATCH = withAdmin(async (_admin, req: Request) => {
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { id, ...fields } = parsed.data;

  await db.update(banners).set(fields).where(eq(banners.id, id));
  // only one banner active at a time
  if (fields.active === true) await db.update(banners).set({ active: false }).where(ne(banners.id, id));
  return Response.json({ ok: true });
});

export const DELETE = withAdmin(async (_admin, req: Request) => {
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "number") return Response.json({ error: "invalid_request" }, { status: 400 });
  await db.delete(banners).where(eq(banners.id, id));
  return Response.json({ ok: true });
});
