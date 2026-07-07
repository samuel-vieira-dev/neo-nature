import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { doseLogs, bottles, pointsLedger, users } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow, userToday, isoDay, addDays } from "@/server/time";
import { computeStreak } from "@/server/domain";

const bodySchema = z.object({ recover: z.boolean().optional() }).optional();

/** Log today's dose (or recover yesterday's, spending a streak freeze) */
export const POST = withUser(async (user, request: Request) => {
  const parsed = bodySchema.safeParse(await (request as Request).json().catch(() => undefined));
  const recover = parsed.success ? parsed.data?.recover === true : false;

  const now = appNow(user);
  const today = userToday(user);
  const targetDay = recover ? isoDay(addDays(now, -1)) : today;

  if (recover) {
    if (user.freezes <= 0) return Response.json({ error: "no_freezes_left" }, { status: 400 });
    await db.update(users).set({ freezes: user.freezes - 1 }).where(eq(users.id, user.id));
  }

  const bottle = await db.query.bottles.findFirst({
    where: and(eq(bottles.userId, user.id), eq(bottles.active, true)),
  });

  const inserted = await db
    .insert(doseLogs)
    .values({
      userId: user.id,
      productId: bottle?.productId ?? "heroup",
      day: targetDay,
      takenAt: now,
      source: recover ? "recover" : "checkin",
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length > 0) {
    await db.insert(pointsLedger).values({
      userId: user.id,
      delta: 10,
      reason: recover ? "Recovered dose" : "Daily check-in",
      expiresAt: addDays(now, 90),
    });
  }

  // refresh best streak + clear churn flag on activity
  const doses = await db.query.doseLogs.findMany({
    where: eq(doseLogs.userId, user.id),
    columns: { day: true },
    orderBy: [desc(doseLogs.day)],
  });
  const streak = computeStreak(doses.map((d) => d.day), today);
  await db
    .update(users)
    .set({ bestStreak: Math.max(user.bestStreak, streak), churnFlag: false })
    .where(eq(users.id, user.id));

  return Response.json({ ok: true, streak, logged: inserted.length > 0 });
});
