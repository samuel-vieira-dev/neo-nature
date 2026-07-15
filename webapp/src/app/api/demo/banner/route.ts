import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { banners } from "@/db/schema";
import { withUser, isDemoMode } from "@/server/session";

/** Demo panel: cycles the active banner to the next one in insertion order. */
export const POST = withUser(async () => {
  if (!isDemoMode()) return Response.json({ error: "not_available" }, { status: 403 });

  const all = await db.query.banners.findMany({ orderBy: [asc(banners.id)] });
  if (all.length === 0) return Response.json({ error: "no_banners" }, { status: 404 });

  const currentIndex = all.findIndex((b) => b.active);
  const nextIndex = (currentIndex + 1) % all.length;

  await db.update(banners).set({ active: false }).where(eq(banners.active, true));
  const next = all[nextIndex];
  await db.update(banners).set({ active: true }).where(eq(banners.id, next.id));

  return Response.json({ ok: true, banner: { id: next.id, title: next.title } });
});
