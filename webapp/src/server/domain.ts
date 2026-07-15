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
