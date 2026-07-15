import { desc, eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { doseLogs, notifications, bottles } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow, userToday } from "@/server/time";
import { computeStreak, bottleForecast } from "@/server/domain";

export const GET = withUser(async (user) => {
  const today = userToday(user);
  const now = appNow(user);

  const [doses, unreadRows, bottleRows] = await Promise.all([
    db.query.doseLogs.findMany({ where: eq(doseLogs.userId, user.id), orderBy: [desc(doseLogs.day)] }),
    db.query.notifications.findMany({
      where: and(eq(notifications.userId, user.id), isNull(notifications.readAt)),
      columns: { id: true },
    }),
    db.query.bottles.findMany({ where: and(eq(bottles.userId, user.id), eq(bottles.active, true)) }),
  ]);

  const days = doses.map((d) => d.day);
  const streak = computeStreak(days, today);

  const bottle = bottleRows[0]
    ? { productId: bottleRows[0].productId, ...bottleForecast(bottleRows[0], now) }
    : null;

  return Response.json({
    user: {
      id: user.id,
      name: user.name,
      fullName: user.fullName,
      email: user.email,
      niche: user.niche,
      motivation: user.motivation,
      address: user.address,
      memberSince: user.memberSince,
      prefs: user.prefs,
      onboarded: !!user.onboardedAt,
      churnFlag: user.churnFlag,
    },
    today,
    now: now.toISOString(),
    streak,
    bestStreak: Math.max(user.bestStreak, streak),
    totalDays: days.length,
    checkedInToday: days.includes(today),
    checkinDays: days,
    lastDoseDay: days[0] ?? null,
    unread: unreadRows.length,
    bottle,
    demo: { mode: process.env.DEMO_MODE === "true", dayOffset: user.demoDayOffset },
  });
});
