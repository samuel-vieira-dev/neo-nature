import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { users, bottles, reminders, doseLogs } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow, userToday } from "@/server/time";
import { linkOrdersToUser } from "@/server/buygoods";
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
  // Accounts created outside BuyGoods have no name/email on file — onboarding
  // asks for them. BuyGoods customers already have both, so these stay absent.
  firstName: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email().max(160).optional(),
});

export const POST = withUser(async (user, request: Request) => {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid_request" }, { status: 400 });

  const { niche, motivation, productId, firstDoseTaken, reminders: reminderList, photoId, firstName, email } =
    parsed.data;
  const product = productById(productId);
  if (!product) return Response.json({ error: "unknown_product" }, { status: 400 });

  const now = appNow(user);

  // Only fill what's still missing — a BuyGoods name/email always wins.
  const setName = !user.name && firstName ? firstName : null;
  const setEmail = !user.email && email ? email : null;

  if (setEmail) {
    const taken = await db.query.users.findFirst({ where: eq(users.email, setEmail), columns: { id: true } });
    if (taken) return Response.json({ error: "email_taken" }, { status: 409 });
  }

  await db
    .update(users)
    .set({
      niche,
      motivation,
      onboardedAt: user.onboardedAt ?? now,
      ...(setName ? { name: setName, fullName: user.fullName || setName } : {}),
      ...(setEmail ? { email: setEmail } : {}),
    })
    .where(eq(users.id, user.id));

  // an account that just gained an email may match orders ingested earlier
  if (setEmail) await linkOrdersToUser(user.id, { email: setEmail, phone: user.phone });

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
    await db
      .insert(doseLogs)
      .values({
        userId: user.id,
        productId: product.id,
        day: userToday(user),
        takenAt: now,
        source: "onboarding",
        photoId: photoId ?? null,
      })
      .onConflictDoNothing();
  }

  return Response.json({ ok: true });
});
