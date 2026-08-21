import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow } from "@/server/time";

/**
 * Marks the lightweight pre-arrival setup done (install + notifications) for
 * a first-time customer whose order hasn't arrived yet. They get into the app
 * — home shows package tracking — without the full onboarding, which runs
 * from the home CTA once the package is in hand (POST /api/onboarding).
 */
export const POST = withUser(async (user) => {
  if (!user.awaitingDeliveryAt) {
    await db.update(users).set({ awaitingDeliveryAt: appNow(user) }).where(eq(users.id, user.id));
  }
  return Response.json({ ok: true });
});
