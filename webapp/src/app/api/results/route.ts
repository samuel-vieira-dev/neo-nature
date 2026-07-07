import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { resultsEntries, pointsLedger } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow, userToday, addDays } from "@/server/time";

const TYPES = ["weight", "waist", "ed_score", "glucose_am", "glucose_pm", "victory"] as const;

export const GET = withUser(async (user) => {
  const rows = await db.query.resultsEntries.findMany({
    where: eq(resultsEntries.userId, user.id),
    orderBy: [asc(resultsEntries.day), asc(resultsEntries.id)],
  });

  return Response.json({
    entries: rows.map((r) => ({
      id: r.id,
      type: r.type,
      valueNum: r.valueNum ? Number(r.valueNum) : null,
      valueText: r.valueText,
      photoId: r.photoId,
      day: r.day,
    })),
  });
});

const createSchema = z.object({
  type: z.enum(TYPES),
  valueNum: z.number().min(0).max(1000).optional(),
  valueText: z.string().max(300).optional(),
  photoId: z.number().optional(),
});

export const POST = withUser(async (user, request: Request) => {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });
  const { type, valueNum, valueText, photoId } = parsed.data;

  if (type !== "victory" && valueNum === undefined) {
    return Response.json({ error: "value_required" }, { status: 400 });
  }
  if (type === "victory" && !valueText) {
    return Response.json({ error: "text_required" }, { status: 400 });
  }

  const today = userToday(user);
  const now = appNow(user);

  // one entry per metric per day keeps trends clean (victories are unlimited)
  if (type !== "victory") {
    const existing = await db.query.resultsEntries.findFirst({
      where: and(
        eq(resultsEntries.userId, user.id),
        eq(resultsEntries.type, type),
        eq(resultsEntries.day, today)
      ),
    });
    if (existing) {
      await db
        .update(resultsEntries)
        .set({ valueNum: valueNum?.toString(), photoId: photoId ?? existing.photoId, loggedAt: now })
        .where(eq(resultsEntries.id, existing.id));
      return Response.json({ ok: true, updated: true });
    }
  }

  await db.insert(resultsEntries).values({
    userId: user.id,
    type,
    valueNum: valueNum?.toString(),
    valueText,
    photoId: photoId ?? null,
    day: today,
    loggedAt: now,
  });

  await db.insert(pointsLedger).values({
    userId: user.id,
    delta: 5,
    reason: type === "victory" ? "Victory logged" : "Progress logged",
    expiresAt: addDays(now, 90),
  });

  return Response.json({ ok: true, updated: false });
});
