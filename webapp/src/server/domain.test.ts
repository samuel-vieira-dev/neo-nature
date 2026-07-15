import { describe, it, expect } from "vitest";
import { computeStreak, bottleForecast, daysWithoutDose } from "./domain";

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
