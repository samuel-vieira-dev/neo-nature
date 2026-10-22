import { afterEach, describe, expect, it, vi } from "vitest";
import { backfillSkipReason, parseBackfillArgs, projectBackfillDecisions, type BackfillSnapshot } from "./support-email-backfill";

const window = { since: new Date("2026-10-21T21:00:00Z"), until: new Date("2026-10-22T12:38:00Z") };
const base = (): BackfillSnapshot => ({
  conversation: { id: "c1", ticketNumber: 10001, tier: "T1", owner: "agent", requiresHuman: false, ticketStatus: "new", status: "generation_failed", source: "email", kind: "support", threadId: "thread-1", assignedAdminId: null, escalationReason: null, freshdeskImportUpdatedAt: null, latestMessageId: "m1" },
  latest: { id: "m1", direction: "incoming", receivedAt: new Date("2026-10-22T02:00:00Z") },
  repliesSinceWindow: 0, staffActivitySinceWindow: 0,
  jobs: [{ messageId: "m1", stage: "prepare", status: "failed", draft: null, error: "generation_failed" }],
});
const draft = (index?: number) => ({ tier: "T1" as const, language: "en", intent: "x", needsHuman: false, reason: "", reply: "hi", ...(index === undefined ? {} : { partialRolloutT1Index: index }) });

describe("parseBackfillArgs", () => {
  it("defaults to the outage window as a dry-run", () => {
    const o = parseBackfillArgs([]);
    expect(o).toMatchObject({ execute: false, limit: 500 });
    expect(o.since.toISOString()).toBe("2026-10-21T21:00:00.000Z");
    expect(o.until.toISOString()).toBe("2026-10-22T12:38:00.000Z");
  });
  it("accepts overrides and requires explicit --execute and offsets", () => {
    const o = parseBackfillArgs(["--since=2026-10-21T20:00:00Z", "--until", "2026-10-22T10:00:00-03:00", "--execute"]);
    expect(o.execute).toBe(true);
    expect(o.since.toISOString()).toBe("2026-10-21T20:00:00.000Z");
    expect(() => parseBackfillArgs(["--since", "2026-10-21T18:00:00"])).toThrow(/offset/);
    expect(() => parseBackfillArgs(["--since", "2026-10-23T00:00:00Z"])).toThrow(/before/);
    expect(() => parseBackfillArgs(["--limit", "0"])).toThrow(/limit/);
  });
});

describe("backfillSkipReason", () => {
  it("accepts an untouched T1 ticket whose generation failed during the outage", () => {
    expect(backfillSkipReason(base(), window)).toBeNull();
  });
  it.each([
    ["not_t1", (s: BackfillSnapshot) => { s.conversation.tier = "T2"; }],
    ["human_required", (s: BackfillSnapshot) => { s.conversation.requiresHuman = true; }],
    ["closed_or_replied", (s: BackfillSnapshot) => { s.conversation.ticketStatus = "closed"; }],
    ["staff_touched", (s: BackfillSnapshot) => { s.conversation.assignedAdminId = "admin-1"; }],
    ["staff_touched", (s: BackfillSnapshot) => { s.staffActivitySinceWindow = 1; }],
    ["staff_touched", (s: BackfillSnapshot) => { s.jobs.push({ messageId: "m0", stage: "manual_send", status: "succeeded", draft: null, error: null }); }],
    ["replied", (s: BackfillSnapshot) => { s.repliesSinceWindow = 1; }],
    ["latest_not_incoming", (s: BackfillSnapshot) => { s.latest!.direction = "note"; }],
    ["latest_outside_window", (s: BackfillSnapshot) => { s.latest!.receivedAt = new Date("2026-10-22T13:00:00Z"); }],
    ["local_thread", (s: BackfillSnapshot) => { s.conversation.threadId = "local:1"; }],
    ["imported_or_non_email", (s: BackfillSnapshot) => { s.conversation.source = "freshdesk"; }],
    ["delivery_uncertain", (s: BackfillSnapshot) => { s.jobs[0].status = "unknown"; }],
    ["already_sent", (s: BackfillSnapshot) => { s.jobs[0] = { messageId: "m1", stage: "send", status: "succeeded", draft: draft(4), error: null }; }],
    ["already_sampled", (s: BackfillSnapshot) => { s.jobs[0] = { messageId: "m1", stage: "send", status: "review", draft: draft(5), error: "t1_not_sampled" }; }],
    ["already_queued", (s: BackfillSnapshot) => { s.jobs[0].status = "queued"; }],
  ] as const)("skips %s", (reason, mutate) => {
    const s = base();
    mutate(s);
    expect(backfillSkipReason(s, window)).toBe(reason);
  });
  it("ignores cancelled jobs of older messages", () => {
    const s = base();
    s.jobs.push({ messageId: "m0", stage: "prepare", status: "cancelled", draft: draft(1), error: "new_customer_message" });
    expect(backfillSkipReason(s, window)).toBeNull();
  });
});

describe("projectBackfillDecisions", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("follows the shared alternating counter at 50%", () => {
    vi.stubEnv("SUPPORT_EMAIL_ALLOWED_RECIPIENTS", "pilot@example.test");
    const rollout = { partialRolloutEnabled: true, t1SendPercent: 50 };
    expect(projectBackfillDecisions(["a@example.test", "b@example.test", "pilot@example.test", "c@example.test"], 0, rollout))
      .toEqual(["not_answered", "send_if_still_T1", "pilot_rules", "not_answered"]);
    expect(projectBackfillDecisions(["a@example.test"], 7, rollout)).toEqual(["send_if_still_T1"]);
  });
});
