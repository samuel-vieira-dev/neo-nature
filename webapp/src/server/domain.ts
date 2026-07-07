import { isoDay, DAY_MS } from "./time";

// ---------------------------------------------------------------------------
// Pure domain logic — unit-tested in src/server/domain.test.ts
// ---------------------------------------------------------------------------

/** Current streak: consecutive days ending today (or yesterday if today isn't logged) */
export function computeStreak(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  let cursorMs = set.has(today)
    ? Date.parse(today + "T12:00:00Z")
    : Date.parse(today + "T12:00:00Z") - DAY_MS;
  let streak = 0;
  while (set.has(isoDay(new Date(cursorMs)))) {
    streak++;
    cursorMs -= DAY_MS;
  }
  return streak;
}

/** Points balance ignoring expired entries + how many expire within 30 days */
export function pointsBalance(
  ledger: { delta: number; expiresAt: Date | null }[],
  now: Date
): { total: number; expiringSoon: number; nextExpiryAt: Date | null } {
  let total = 0;
  let expiringSoon = 0;
  let nextExpiryAt: Date | null = null;
  const soon = new Date(now.getTime() + 30 * DAY_MS);
  for (const e of ledger) {
    if (e.expiresAt && e.expiresAt <= now) continue; // expired
    total += e.delta;
    if (e.delta > 0 && e.expiresAt && e.expiresAt <= soon) {
      expiringSoon += e.delta;
      if (!nextExpiryAt || e.expiresAt < nextExpiryAt) nextExpiryAt = e.expiresAt;
    }
  }
  return { total: Math.max(0, total), expiringSoon, nextExpiryAt };
}

/** Bottle inventory: doses/days left and predicted run-out date */
export function bottleForecast(
  bottle: { capsules: number; dosePerDay: number; openedAt: Date },
  now: Date
): { dosesTaken: number; dosesLeft: number; daysLeft: number; runsOutAt: Date } {
  const daysOpen = Math.max(0, Math.floor((now.getTime() - bottle.openedAt.getTime()) / DAY_MS));
  const totalDoses = Math.floor(bottle.capsules / bottle.dosePerDay);
  const dosesTaken = Math.min(totalDoses, daysOpen);
  const daysLeft = Math.max(0, totalDoses - dosesTaken);
  return {
    dosesTaken,
    dosesLeft: daysLeft,
    daysLeft,
    runsOutAt: new Date(now.getTime() + daysLeft * DAY_MS),
  };
}

/** Churn detection: days without a dose (2+ = at risk) */
export function daysWithoutDose(lastDoseDay: string | null, today: string): number {
  if (!lastDoseDay) return Infinity;
  return Math.floor((Date.parse(today) - Date.parse(lastDoseDay)) / DAY_MS);
}

/** Subscription tier from months active: Bronze 0-2 · Silver 3-5 · Gold 6+ */
export function tierFor(monthsActive: number): { tier: "Bronze" | "Silver" | "Gold"; nextTier: "Silver" | "Gold" | null; monthsToNext: number } {
  if (monthsActive >= 6) return { tier: "Gold", nextTier: null, monthsToNext: 0 };
  if (monthsActive >= 3) return { tier: "Silver", nextTier: "Gold", monthsToNext: 6 - monthsActive };
  return { tier: "Bronze", nextTier: "Silver", monthsToNext: 3 - monthsActive };
}
