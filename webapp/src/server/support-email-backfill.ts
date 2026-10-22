/**
 * Backfill for T1 email tickets left without an automatic reply during an outage window.
 * Never generates or sends anything itself: --execute only re-queues the normal "prepare"
 * job, so the worker applies the usual AI guardrails, the shared T1 counter
 * (partialRolloutT1Index), the "Not answered" status and "Human required" escalation.
 */
import { and, asc, count, eq, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import type { db as Database } from "@/db";
import { supportEmailConversations as conversations, supportEmailMessages as messages, supportEmailJobs as jobs } from "@/db/schema";
import { sampledT1Ticket, usesPartialEmailRollout, type PartialEmailRollout } from "./support-email-contract";

export const OUTAGE_DEFAULT_SINCE = "2026-10-21T18:00:00-03:00";
export const OUTAGE_DEFAULT_UNTIL = "2026-10-22T09:38:00-03:00";

export type BackfillOptions = { since: Date; until: Date; execute: boolean; limit: number };
export function parseBackfillArgs(argv: string[]): BackfillOptions {
  const value = (name: string) => {
    const at = argv.findIndex(a => a === name || a.startsWith(`${name}=`));
    if (at < 0) return undefined;
    return argv[at].includes("=") ? argv[at].slice(name.length + 1) : argv[at + 1];
  };
  const date = (name: string, fallback: string) => {
    const raw = value(name) ?? fallback;
    // Require an explicit offset so a run never depends on the machine's time zone.
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw)) throw new Error(`${name} must include a time zone offset, e.g. 2026-10-21T18:00:00-03:00`);
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) throw new Error(`${name} is not a valid date`);
    return d;
  };
  const since = date("--since", OUTAGE_DEFAULT_SINCE);
  const until = date("--until", OUTAGE_DEFAULT_UNTIL);
  if (since >= until) throw new Error("--since must be before --until");
  if (until.getTime() - since.getTime() > 7 * 86_400_000) throw new Error("Window longer than 7 days; narrow --since/--until");
  const limit = Number(value("--limit") ?? 500);
  if (!Number.isInteger(limit) || limit < 1 || limit > 2000) throw new Error("--limit must be an integer between 1 and 2000");
  return { since, until, execute: argv.includes("--execute"), limit };
}

export type BackfillSnapshot = {
  conversation: Pick<typeof conversations.$inferSelect, "id" | "ticketNumber" | "tier" | "owner" | "requiresHuman" | "ticketStatus" | "status" | "source" | "kind" | "threadId" | "assignedAdminId" | "escalationReason" | "freshdeskImportUpdatedAt" | "latestMessageId">;
  latest: Pick<typeof messages.$inferSelect, "id" | "direction" | "receivedAt"> | null;
  /** Outgoing/human messages received at or after `since` (manual or automatic replies). */
  repliesSinceWindow: number;
  /** Notes, replies or audit rows written by a staff member at or after `since`. */
  staffActivitySinceWindow: number;
  /** Every job for the conversation (any message). */
  jobs: Pick<typeof jobs.$inferSelect, "messageId" | "stage" | "status" | "draft" | "error">[];
};
export type SkipReason = "not_t1" | "human_required" | "closed_or_replied" | "staff_touched" | "replied" | "latest_not_incoming" | "latest_outside_window" | "local_thread" | "imported_or_non_email" | "delivery_uncertain" | "already_sampled" | "already_queued" | "already_sent";

/** Pure eligibility check; the same rules are rechecked under the conversation lock before writing. */
export function backfillSkipReason(s: BackfillSnapshot, window: { since: Date; until: Date }): SkipReason | null {
  const c = s.conversation;
  if (c.source !== "email" || c.kind === "refund" || c.freshdeskImportUpdatedAt) return "imported_or_non_email";
  if (c.threadId.startsWith("local:")) return "local_thread";
  if (c.tier !== "T1") return "not_t1";
  if (c.requiresHuman || c.owner === "human") return "human_required";
  if (["pending", "resolved", "closed"].includes(c.ticketStatus) || c.status === "replied") return "closed_or_replied";
  if (c.assignedAdminId || c.escalationReason === "Staff took over" || s.staffActivitySinceWindow > 0 || s.jobs.some(j => j.stage === "manual_send")) return "staff_touched";
  if (s.repliesSinceWindow > 0) return "replied";
  if (!s.latest || s.latest.direction !== "incoming") return "latest_not_incoming";
  // A newer customer message after the window went through the normal (healthy) flow.
  if (s.latest.receivedAt < window.since || s.latest.receivedAt > window.until) return "latest_outside_window";
  if (s.jobs.some(j => ["unknown", "processing"].includes(j.status))) return "delivery_uncertain";
  const current = s.jobs.filter(j => j.messageId === s.latest!.id && ["prepare", "send"].includes(j.stage));
  if (current.some(j => j.stage === "send" && j.status === "succeeded")) return "already_sent";
  // The shared counter already decided this message (sent or held as "Not answered").
  if (current.some(j => j.draft?.partialRolloutT1Index !== undefined)) return "already_sampled";
  if (current.some(j => j.status === "queued")) return "already_queued";
  return null;
}

/** Projects the worker's decision for eligible tickets in order; live traffic can shift the counter. */
export function projectBackfillDecisions(emails: string[], nextIndex: number, rollout: PartialEmailRollout) {
  let index = nextIndex;
  return emails.map(email => usesPartialEmailRollout(email, rollout)
    ? sampledT1Ticket(index++, rollout.t1SendPercent) ? "send_if_still_T1" : "not_answered"
    : "pilot_rules");
}

type Db = typeof Database;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function snapshot(database: Db | Tx, conversationId: string, since: Date): Promise<BackfillSnapshot & { email: string } | null> {
  const c = await database.query.supportEmailConversations.findFirst({ where: eq(conversations.id, conversationId) });
  if (!c) return null;
  const [latest, replies, staff, convJobs] = await Promise.all([
    c.latestMessageId ? database.query.supportEmailMessages.findFirst({ where: eq(messages.id, c.latestMessageId), columns: { id: true, direction: true, receivedAt: true } }) : null,
    database.select({ n: count() }).from(messages).where(and(eq(messages.conversationId, c.id), inArray(messages.direction, ["outgoing", "human"]), or(gte(messages.receivedAt, since), gte(messages.createdAt, since)))),
    database.select({ n: count() }).from(messages).where(and(eq(messages.conversationId, c.id), isNotNull(messages.authorAdminId), gte(messages.createdAt, since))),
    database.select({ messageId: jobs.messageId, stage: jobs.stage, status: jobs.status, draft: jobs.draft, error: jobs.error }).from(jobs).where(eq(jobs.conversationId, c.id)),
  ]);
  return { email: c.email, conversation: c, latest: latest ?? null, repliesSinceWindow: replies[0].n, staffActivitySinceWindow: staff[0].n, jobs: convJobs };
}

export async function backfillOutageT1(database: Db, options: BackfillOptions, rollout: PartialEmailRollout) {
  if (options.execute && !rollout.partialRolloutEnabled) throw new Error("Partial rollout is disabled; enable it (Admin → Support) before --execute so the T1 counter applies");
  // Candidate set: T1 tickets whose latest message is an incoming email received in the window.
  const rows = await database.select({ id: conversations.id }).from(conversations)
    .innerJoin(messages, eq(messages.id, conversations.latestMessageId))
    .where(and(eq(conversations.tier, "T1"), eq(messages.direction, "incoming"), gte(messages.receivedAt, options.since), lte(messages.receivedAt, options.until)))
    .orderBy(asc(messages.receivedAt), asc(conversations.id)).limit(options.limit);
  const skipped: { ticketNumber: number; reason: SkipReason }[] = [];
  const eligible: { id: string; ticketNumber: number; email: string; messageId: string; receivedAt: string }[] = [];
  for (const row of rows) {
    const s = await snapshot(database, row.id, options.since);
    if (!s) continue;
    const reason = backfillSkipReason(s, options);
    if (reason) skipped.push({ ticketNumber: s.conversation.ticketNumber, reason });
    else eligible.push({ id: s.conversation.id, ticketNumber: s.conversation.ticketNumber, email: s.email, messageId: s.latest!.id, receivedAt: s.latest!.receivedAt.toISOString() });
  }
  const [counter] = await database.select({ n: count() }).from(jobs).where(sql`${jobs.draft}->>'partialRolloutT1Index' is not null`);
  const projection = projectBackfillDecisions(eligible.map(e => e.email), counter.n, rollout);
  const summary = {
    execute: options.execute, since: options.since.toISOString(), until: options.until.toISOString(),
    rollout: { enabled: rollout.partialRolloutEnabled, t1SendPercent: rollout.t1SendPercent, nextCounterIndex: counter.n },
    scanned: rows.length, eligible: eligible.length, skipped: skipped.length,
    skippedByReason: skipped.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.reason]: (acc[s.reason] ?? 0) + 1 }), {}),
    // Ticket numbers only: no customer e-mail addresses or message text in the output.
    candidates: eligible.map((e, i) => ({ ticketNumber: e.ticketNumber, receivedAt: e.receivedAt, projected: projection[i] })),
    skippedTickets: skipped, queued: [] as number[], changedBeforeWrite: [] as number[],
  };
  if (!options.execute) return summary;
  const start = Date.now();
  for (const [i, e] of eligible.entries()) {
    await database.transaction(async tx => {
      // Same lock as intake, staff actions and the worker; then recheck everything.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`conversation:${e.id}`}))`);
      const s = await snapshot(tx, e.id, options.since);
      if (!s || backfillSkipReason(s, options) || s.latest?.id !== e.messageId) { summary.changedBeforeWrite.push(e.ticketNumber); return; }
      // Staggered runAt keeps the worker (ordered by runAt) on the original arrival order.
      const now = new Date(start + i * 1000);
      await tx.update(conversations).set({ owner: "agent", requiresHuman: false, status: "queued", escalationReason: null, updatedAt: new Date() }).where(eq(conversations.id, e.id));
      const existing = await tx.select({ id: jobs.id, stage: jobs.stage }).from(jobs).where(and(eq(jobs.messageId, e.messageId), inArray(jobs.stage, ["prepare", "send"])));
      const reuse = existing.find(j => j.stage === "prepare") ?? existing[0];
      if (reuse) {
        await tx.update(jobs).set({ stage: "prepare", status: "queued", attempts: 0, draft: null, error: null, startedAt: null, runAt: now, sendAfter: now }).where(eq(jobs.id, reuse.id));
        const others = existing.filter(j => j.id !== reuse.id).map(j => j.id);
        if (others.length) await tx.update(jobs).set({ status: "cancelled", error: "outage_backfill_superseded" }).where(inArray(jobs.id, others));
      } else {
        await tx.insert(jobs).values({ id: crypto.randomUUID(), conversationId: e.id, messageId: e.messageId, stage: "prepare", runAt: now, sendAfter: now });
      }
      summary.queued.push(e.ticketNumber);
    });
  }
  return summary;
}
