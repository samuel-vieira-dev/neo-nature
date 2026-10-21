import { afterEach, describe, expect, it, vi } from "vitest";
import { canAutoDeliverEmail, canDeliverEmail, sampledT1Ticket, usesPartialEmailRollout } from "./support-email-contract";
import { toneInputSchema } from "./support-email-tone";

const rollout = { partialRolloutEnabled: true, t1SendPercent: 100 };
afterEach(() => vi.unstubAllEnvs());

describe("partial email rollout policy", () => {
  it("selects no tickets at 0% and all tickets at 100%", () => {
    for (let i = 0; i < 500; i++) {
      expect(sampledT1Ticket(i, 0)).toBe(false);
      expect(sampledT1Ticket(i, 100)).toBe(true);
    }
  });
  it("alternates held/sent at 50% and evenly spreads every integer percentage", () => {
    expect(Array.from({ length: 8 }, (_, n) => sampledT1Ticket(n, 50))).toEqual([false, true, false, true, false, true, false, true]);
    for (let percent = 0; percent <= 100; percent++) {
      let sent = 0;
      for (let n = 0; n < 300; n++) {
        sent += Number(sampledT1Ticket(n, percent));
        expect(sent).toBe(Math.floor((n + 1) * percent / 100));
      }
    }
  });
  it.each([undefined, -1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1])("fails closed for an invalid or missing decision index: %s", n => {
    expect(sampledT1Ticket(n, 100)).toBe(false);
  });
  it.each(["draft", "pilot", "live"])("only sends selected real T1 tickets in %s", mode => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", mode);
    vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "tester@example.com");
    expect(canAutoDeliverEmail("customer@example.com", 0, "T1", rollout)).toBe(true);
    expect(canAutoDeliverEmail("customer@example.com", 0, "T1", { ...rollout, t1SendPercent: 0 })).toBe(false);
    for (const tier of ["T2", "T3"]) expect(canAutoDeliverEmail("customer@example.com", 0, tier, rollout)).toBe(false);
    expect(canDeliverEmail("customer@example.com", rollout)).toBe(true); // Staff reply
  });
  it("preserves the allowlisted tester's pilot behavior, including T2, at 0%", () => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot");
    vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "tester@example.com");
    const zero = { ...rollout, t1SendPercent: 0 };
    expect(usesPartialEmailRollout("TESTER@example.com", zero)).toBe(false);
    for (const tier of ["T1", "T2"]) expect(canAutoDeliverEmail("TESTER@example.com", 0, tier, zero)).toBe(true);
    expect(canAutoDeliverEmail("tester@example.com", 0, "T3", zero)).toBe(false);
    vi.stubEnv("SUPPORT_EMAIL_MODE", "draft");
    expect(canDeliverEmail("tester@example.com", zero)).toBe(false);
  });
  it("leaves existing pilot/live behavior intact when disabled and respects off", () => {
    vi.stubEnv("SUPPORT_EMAIL_MODE", "pilot");
    vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "tester@example.com");
    expect(canAutoDeliverEmail("customer@example.com", 0, "T1", { ...rollout, partialRolloutEnabled: false })).toBe(false);
    vi.stubEnv("SUPPORT_EMAIL_MODE", "live");
    expect(canAutoDeliverEmail("customer@example.com", 0, "T2", { ...rollout, partialRolloutEnabled: false })).toBe(true);
    vi.stubEnv("SUPPORT_EMAIL_MODE", "off");
    expect(canAutoDeliverEmail("customer@example.com", 0, "T1", rollout)).toBe(false);
    expect(canDeliverEmail("customer@example.com", rollout)).toBe(false);
  });
  it.each([-1, 101, 0.5, NaN])("rejects invalid percentages: %s", t1SendPercent => {
    expect(toneInputSchema.safeParse({ instructions: "", version: 0, ...rollout, t1SendPercent }).success).toBe(false);
    expect(sampledT1Ticket(0, t1SendPercent)).toBe(false);
  });
});
