import { describe, expect, it } from "vitest";
import { businessHoursBetween, zonedDay, zonedDayStart } from "./business-hours";

// US Eastern: EDT (UTC-4) until Sun Nov 1, 2026, then EST (UTC-5).
const at = (iso: string) => new Date(iso);

describe("business hours (Mon–Fri, US Eastern)", () => {
  it("counts every hour inside a weekday", () => {
    expect(businessHoursBetween(at("2026-11-04T14:00:00Z"), at("2026-11-04T16:30:00Z"))).toBe(2.5);
  });

  it("skips the weekend: Friday 6 pm → Monday 9 am is 15 h", () => {
    expect(businessHoursBetween(at("2026-11-06T23:00:00Z"), at("2026-11-09T14:00:00Z"))).toBe(15);
  });

  it("a ticket written and answered on the weekend took 0 business hours", () => {
    expect(businessHoursBetween(at("2026-11-07T15:00:00Z"), at("2026-11-08T20:00:00Z"))).toBe(0);
  });

  it("keeps 24 h days across the DST change", () => {
    // Fri Oct 30 00:00 EDT → Tue Nov 3 00:00 EST: Fri + Mon = 48 h.
    expect(businessHoursBetween(at("2026-10-30T04:00:00Z"), at("2026-11-03T05:00:00Z"))).toBe(48);
  });

  it("returns 0 for a reversed range", () => {
    expect(businessHoursBetween(at("2026-11-05T12:00:00Z"), at("2026-11-04T12:00:00Z"))).toBe(0);
  });

  it("maps days to the report time zone", () => {
    expect(zonedDayStart("2026-11-05").toISOString()).toBe("2026-11-05T05:00:00.000Z");
    expect(zonedDayStart("2026-10-30").toISOString()).toBe("2026-10-30T04:00:00.000Z");
    expect(zonedDay(at("2026-11-06T03:00:00Z"))).toBe("2026-11-05");
  });
});
