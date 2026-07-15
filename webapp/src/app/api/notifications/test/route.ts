import { db } from "@/db";
import { doseLogs } from "@/db/schema";
import { withUser } from "@/server/session";
import { userToday } from "@/server/time";
import { computeStreak } from "@/server/domain";
import { notifyUser } from "@/server/push";
import { desc, eq } from "drizzle-orm";

/** Demo helper: sends a REAL web push (plus the in-app notification row) */
export const POST = withUser(async (user) => {
  const doses = await db.query.doseLogs.findMany({
    where: eq(doseLogs.userId, user.id),
    columns: { day: true },
    orderBy: [desc(doseLogs.day)],
  });
  const streak = computeStreak(doses.map((d) => d.day), userToday(user));
  const body = `💊 Time for your dose — keep that ${streak}-day streak alive!`;

  await notifyUser(user.id, { title: "Neo Nature 🌿", body, icon: "flame", url: "/" });

  return Response.json({ ok: true, title: "Neo Nature 🌿", body });
});
