import { db } from "@/db";
import { notifications, doseLogs } from "@/db/schema";
import { withUser } from "@/server/session";
import { userToday } from "@/server/time";
import { computeStreak } from "@/server/domain";
import { desc, eq } from "drizzle-orm";

/** Demo helper: creates an in-app notification (real web push arrives in Etapa 3) */
export const POST = withUser(async (user) => {
  const doses = await db.query.doseLogs.findMany({
    where: eq(doseLogs.userId, user.id),
    columns: { day: true },
    orderBy: [desc(doseLogs.day)],
  });
  const streak = computeStreak(doses.map((d) => d.day), userToday(user));
  const body = `💊 Time for your dose — keep that ${streak}-day streak alive!`;

  const [row] = await db
    .insert(notifications)
    .values({ userId: user.id, title: "Test notification 🔔", body, icon: "flame" })
    .returning();

  return Response.json({ ok: true, title: "Neo Nature 🌿", body, id: row.id });
});
