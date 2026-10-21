import { afterEach, describe, expect, it, vi } from "vitest";
import { canAutoDeliverEmail, canDeliverEmail, sampledT1Ticket, usesPartialEmailRollout } from "./support-email-contract";
import { toneInputSchema } from "./support-email-tone";

const rollout = { partialRolloutEnabled: true, t1SendPercent: 100 };
afterEach(() => vi.unstubAllEnvs());

describe("partial email rollout policy", () => {
  it("selects no tickets at 0% and all tickets at 100%", () => {
    for (let i = 0; i < 500; i++) {
      expect(sampledT1Ticket(`ticket-${i}`, 0)).toBe(false);
      expect(sampledT1Ticket(`ticket-${i}`, 100)).toBe(true);
    }
  });
  it("uses repeatable nested cohorts for a partial percentage", () => {
    const tickets = Array.from({ length: 1000 }, (_, i) => `ticket-${i}`);
    const cohort = tickets.filter(id => sampledT1Ticket(id, 25));
    expect(cohort.length).toBeGreaterThan(150);
    expect(cohort.length).toBeLessThan(350);
    expect(tickets.filter(id => sampledT1Ticket(id, 25))).toEqual(cohort);
    expect(cohort.every(id => sampledT1Ticket(id, 50))).toBe(true);
    expect(sampledT1Ticket("ticket-0", 25)).toBe(false);
    expect(sampledT1Ticket("ticket-1", 42)).toBe(true);
  });
  it.each(["draft", "pilot", "live"])("only sends selected real T1 tickets in %s", mode => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", mode);
    vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "tester@example.com");
    expect(canAutoDeliverEmail("customer@example.com", "ticket", "T1", rollout)).toBe(true);
    expect(canAutoDeliverEmail("customer@example.com", "ticket", "T1", { ...rollout, t1SendPercent: 0 })).toBe(false);
    for (const tier of ["T2", "T3"]) expect(canAutoDeliverEmail("customer@example.com", "ticket", tier, rollout)).toBe(false);
    expect(canDeliverEmail("customer@example.com", rollout)).toBe(true); // Staff reply
  });
  it("preserves the allowlisted tester's pilot behavior, including T2, at 0%", () => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot");
    vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "tester@example.com");
    const zero = { ...rollout, t1SendPercent: 0 };
    expect(usesPartialEmailRollout("TESTER@example.com", zero)).toBe(false);
    for (const tier of ["T1", "T2"]) expect(canAutoDeliverEmail("TESTER@example.com", "ticket", tier, zero)).toBe(true);
    expect(canAutoDeliverEmail("tester@example.com", "ticket", "T3", zero)).toBe(false);
    vi.stubEnv("SUPPORT_EMAIL_MODE", "draft");
    expect(canDeliverEmail("tester@example.com", zero)).toBe(false);
  });
  it("leaves existing pilot/live behavior intact when disabled and respects off", () => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot");
    vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "tester@example.com");
    expect(canAutoDeliverEmail("customer@example.com", "ticket", "T1", { ...rollout, partialRolloutEnabled: false })).toBe(false);
    vi.stubEnv("SUPPORT_EMAIL_MODE", "live");
    expect(canAutoDeliverEmail("customer@example.com", "ticket", "T2", { ...rollout, partialRolloutEnabled: false })).toBe(true);
    vi.stubEnv("SUPPORT_EMAIL_MODE", "off");
    expect(canAutoDeliverEmail("customer@example.com", "ticket", "T1", rollout)).toBe(false);
    expect(canDeliverEmail("customer@example.com", rollout)).toBe(false);
  });
  it.each([-1, 101, 0.5, NaN])("rejects invalid percentages: %s", t1SendPercent => {
    expect(toneInputSchema.safeParse({ instructions: "", version: 0, ...rollout, t1SendPercent }).success).toBe(false);
    expect(sampledT1Ticket("ticket", t1SendPercent)).toBe(false);
  });
});
