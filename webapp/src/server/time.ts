import type { User } from "@/db/schema";

const DAY_MS = 86400000;

/**
 * The single source of "now" for all server logic.
 * Respects the per-user demo time-travel offset so the client can validate
 * time-dependent flows (day-30, billing T-3, churn, refill) in minutes.
 */
export function appNow(user: Pick<User, "demoDayOffset">): Date {
  return new Date(Date.now() + user.demoDayOffset * DAY_MS);
}

/** ISO calendar day (YYYY-MM-DD) for a date */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The user's current "app day" */
export function userToday(user: Pick<User, "demoDayOffset">): string {
  return isoDay(appNow(user));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Whole days between two dates (b - a) */
export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS);
}

export { DAY_MS };
