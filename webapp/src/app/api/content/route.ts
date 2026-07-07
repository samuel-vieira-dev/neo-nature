import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contentProgress, pointsLedger } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow, addDays } from "@/server/time";
import { contentBySlug } from "@/lib/data";

export const GET = withUser(async (user) => {
  const rows = await db.query.contentProgress.findMany({
    where: eq(contentProgress.userId, user.id),
    columns: { slug: true },
  });
  return Response.json({ completed: rows.map((r) => r.slug) });
});

const completeSchema = z.object({ slug: z.string().min(1).max(120) });

export const POST = withUser(async (user, request: Request) => {
  const parsed = completeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const item = contentBySlug(parsed.data.slug);
  if (!item) return Response.json({ error: "not_found" }, { status: 404 });

  const inserted = await db
    .insert(contentProgress)
    .values({ userId: user.id, slug: item.slug })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    await db.insert(pointsLedger).values({
      userId: user.id,
      delta: 5,
      reason: `Completed: ${item.title}`,
      expiresAt: addDays(appNow(user), 90),
    });
  }

  return Response.json({ ok: true });
});
