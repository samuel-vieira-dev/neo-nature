import { desc, eq, isNull, and, gt } from "drizzle-orm";
import { db } from "@/db";
import { doseLogs, pointsLedger, notifications, subscriptions, bottles } from "@/db/schema";
import { withUser } from "@/server/session";
import { appNow, userToday } from "@/server/time";
import { computeStreak, pointsBalance, bottleForecast, tierFor } from "@/server/domain";
import { protocolDay, phaseForDay, expectationForDay } from "@/lib/protocol";

export const GET = withUser(async (user) => {
  const today = userToday(user);
  const now = appNow(user);

  const [doses, ledger, unreadRows, sub, bottleRows] = await Promise.all([
    db.query.doseLogs.findMany({ where: eq(doseLogs.userId, user.id), orderBy: [desc(doseLogs.day)] }),
    db.query.pointsLedger.findMany({ where: eq(pointsLedger.userId, user.id) }),
    db.query.notifications.findMany({
      where: and(eq(notifications.userId, user.id), isNull(notifications.readAt)),
      columns: { id: true },
    }),
    db.query.subscriptions.findFirst({
      where: and(eq(subscriptions.userId, user.id), gt(subscriptions.monthsActive, -1)),
      orderBy: [desc(subscriptions.id)],
    }),
    db.query.bottles.findMany({ where: and(eq(bottles.userId, user.id), eq(bottles.active, true)) }),
  ]);

  const days = doses.map((d) => d.day);
  const streak = computeStreak(days, today);
  const points = pointsBalance(ledger, now);
  const tier = tierFor(sub?.status === "active" || sub?.status === "paused" ? sub.monthsActive : 0);

  const bottle = bottleRows[0]
    ? { productId: bottleRows[0].productId, ...bottleForecast(bottleRows[0], now) }
    : null;

  const protocol = user.onboardedAt
    ? (() => {
        const day = protocolDay(user.onboardedAt, now);
        const phase = phaseForDay(day);
        return { day, phase: { n: phase.n, name: phase.name, focus: phase.focus }, message: expectationForDay(day) };
      })()
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
      freezes: user.freezes,
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
    points: points.total,
    pointsExpiringSoon: points.expiringSoon,
    pointsNextExpiryAt: points.nextExpiryAt,
    unread: unreadRows.length,
    tier,
    subscription: sub ?? null,
    bottle,
    protocol,
    demo: { mode: process.env.DEMO_MODE === "true", dayOffset: user.demoDayOffset },
  });
});
