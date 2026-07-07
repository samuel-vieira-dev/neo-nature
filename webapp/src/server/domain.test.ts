import { describe, it, expect } from "vitest";
import { computeStreak, pointsBalance, bottleForecast, daysWithoutDose, tierFor } from "./domain";

const DAY = 86400000;

describe("computeStreak", () => {
  it("counts consecutive days ending today", () => {
    expect(computeStreak(["2026-07-04", "2026-07-05", "2026-07-06"], "2026-07-06")).toBe(3);
  });
  it("keeps streak alive if today isn't logged yet", () => {
    expect(computeStreak(["2026-07-04", "2026-07-05"], "2026-07-06")).toBe(2);
  });
  it("breaks on a gap", () => {
    expect(computeStreak(["2026-07-01", "2026-07-02", "2026-07-05"], "2026-07-06")).toBe(1);
    expect(computeStreak(["2026-07-01", "2026-07-02"], "2026-07-06")).toBe(0);
  });
  it("handles empty history", () => {
    expect(computeStreak([], "2026-07-06")).toBe(0);
  });
});

describe("pointsBalance", () => {
  const now = new Date("2026-07-06T12:00:00Z");
  it("sums non-expired entries", () => {
    const r = pointsBalance(
      [
        { delta: 100, expiresAt: new Date(now.getTime() + 60 * DAY) },
        { delta: 50, expiresAt: null },
        { delta: 200, expiresAt: new Date(now.getTime() - DAY) }, // expired
      ],
      now
    );
    expect(r.total).toBe(150);
  });
  it("flags points expiring within 30 days", () => {
    const soon = new Date(now.getTime() + 10 * DAY);
    const r = pointsBalance([{ delta: 80, expiresAt: soon }, { delta: 100, expiresAt: new Date(now.getTime() + 90 * DAY) }], now);
    expect(r.expiringSoon).toBe(80);
    expect(r.nextExpiryAt).toEqual(soon);
  });
  it("never returns negative totals", () => {
    expect(pointsBalance([{ delta: -100, expiresAt: null }], now).total).toBe(0);
  });
});

describe("bottleForecast", () => {
  const now = new Date("2026-07-06T12:00:00Z");
  it("predicts run-out from capsules and daily dose", () => {
    const r = bottleForecast({ capsules: 60, dosePerDay: 2, openedAt: new Date(now.getTime() - 12 * DAY) }, now);
    expect(r.dosesTaken).toBe(12);
    expect(r.daysLeft).toBe(18);
    expect(r.runsOutAt.getTime()).toBe(now.getTime() + 18 * DAY);
  });
  it("clamps at zero when past the supply", () => {
    const r = bottleForecast({ capsules: 60, dosePerDay: 2, openedAt: new Date(now.getTime() - 45 * DAY) }, now);
    expect(r.daysLeft).toBe(0);
  });
});

describe("daysWithoutDose", () => {
  it("returns gap in days", () => {
    expect(daysWithoutDose("2026-07-03", "2026-07-06")).toBe(3);
    expect(daysWithoutDose("2026-07-06", "2026-07-06")).toBe(0);
  });
  it("returns Infinity when never dosed", () => {
    expect(daysWithoutDose(null, "2026-07-06")).toBe(Infinity);
  });
});

describe("tierFor", () => {
  it("maps subscription months to tiers", () => {
    expect(tierFor(0).tier).toBe("Bronze");
    expect(tierFor(2)).toEqual({ tier: "Bronze", nextTier: "Silver", monthsToNext: 1 });
    expect(tierFor(3).tier).toBe("Silver");
    expect(tierFor(6).tier).toBe("Gold");
    expect(tierFor(6).nextTier).toBeNull();
  });
});
