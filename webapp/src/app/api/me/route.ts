import { desc, eq, isNull, and } from "drizzle-orm";
import { db } from "@/db";
import { doseLogs, notifications, bottles } from "@/db/schema";
import { withUser, impersonatorId } from "@/server/session";
import { appNow, userToday } from "@/server/time";
import { computeStreak, bottleForecast } from "@/server/domain";
import { loadUserOrders } from "@/server/orders";

export const GET = withUser(async (user) => {
  const today = userToday(user);
  const now = appNow(user);

  const [impersonatedBy, doses, unreadRows, bottleRows, orderList] = await Promise.all([
    impersonatorId(),
    db.query.doseLogs.findMany({ where: eq(doseLogs.userId, user.id), orderBy: [desc(doseLogs.day)] }),
    db.query.notifications.findMany({
      where: and(eq(notifications.userId, user.id), isNull(notifications.readAt)),
      columns: { id: true },
    }),
    db.query.bottles.findMany({ where: and(eq(bottles.userId, user.id), eq(bottles.active, true)) }),
    // Only needed until the customer has done the full onboarding — that's
    // when "is the package still on its way?" decides what the app shows.
    user.onboardedAt ? Promise.resolve([]) : loadUserOrders(user, now),
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
      phone: user.phone,
      niche: user.niche,
      motivation: user.motivation,
      address: user.address,
      memberSince: user.memberSince,
      prefs: user.prefs,
      onboarded: !!user.onboardedAt,
      awaitingDelivery: !!user.awaitingDeliveryAt,
      churnFlag: user.churnFlag,
    },
    pendingDelivery: orderList.some((o) => o.awaitingArrival),
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
    // an admin previewing this account skips the onboarding gate — see
    // OnboardingGate — so leads can be inspected without faking their answers
    impersonating: !!impersonatedBy,
  });
});
