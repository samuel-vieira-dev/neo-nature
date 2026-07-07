import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, bottles, reminders, doseLogs, pointsLedger } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow, userToday, addDays } from "@/server/time";
import { productById } from "@/lib/data";

const schema = z.object({
  niche: z.enum(["mens_health", "weight_loss", "diabetes"]),
  motivation: z.string().max(300).default(""),
  productId: z.string(),
  firstDoseTaken: z.boolean().default(false),
  reminders: z
    .array(z.object({ time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), habitAnchor: z.string().max(120).nullish() }))
    .max(3)
    .default([]),
  photoId: z.number().optional(),
});

export const POST = withUser(async (user, request: Request) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const { niche, motivation, productId, firstDoseTaken, reminders: reminderList, photoId } = parsed.data;
  const product = productById(productId);
  if (!product) return Response.json({ error: "unknown_product" }, { status: 400 });

  const now = appNow(user);

  await db
    .update(users)
    .set({ niche, motivation, onboardedAt: user.onboardedAt ?? now })
    .where(eq(users.id, user.id));

  // active bottle for dose-remaining forecasts
  await db.update(bottles).set({ active: false }).where(eq(bottles.userId, user.id));
  await db.insert(bottles).values({
    userId: user.id,
    productId: product.id,
    capsules: product.capsules,
    dosePerDay: product.dosePerDay,
    openedAt: now,
  });

  // reminders (replace any existing)
  await db.delete(reminders).where(eq(reminders.userId, user.id));
  if (reminderList.length > 0) {
    await db.insert(reminders).values(
      reminderList.map((r) => ({ userId: user.id, time: r.time, habitAnchor: r.habitAnchor ?? null }))
    );
  }

  if (firstDoseTaken) {
    const inserted = await db
      .insert(doseLogs)
      .values({
        userId: user.id,
        productId: product.id,
        day: userToday(user),
        takenAt: now,
        source: "onboarding",
        photoId: photoId ?? null,
      })
      .onConflictDoNothing()
      .returning();
    if (inserted.length > 0) {
      await db.insert(pointsLedger).values({
        userId: user.id,
        delta: 10,
        reason: "First dose logged",
        expiresAt: addDays(now, 90),
      });
    }
  }

  // welcome bonus (idempotent: at most one per user)
  const hasWelcome = await db.query.pointsLedger.findFirst({
    where: and(eq(pointsLedger.userId, user.id), eq(pointsLedger.reason, "Welcome bonus")),
  });
  if (!hasWelcome) {
    await db.insert(pointsLedger).values({
      userId: user.id,
      delta: 200,
      reason: "Welcome bonus",
      expiresAt: addDays(now, 120),
    });
  }

  return Response.json({ ok: true });
});
