/** DML only. Dry-run by default; execute explicitly with --apply. Never loads .env. */
import { pathToFileURL } from "node:url";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, rawSql } from "../src/db";
import { supportEmailConversations as conversations, supportEmailMessages as messages, supportEmailJobs as jobs, tickets } from "../src/db/schema";

export async function reprocessT1T2Handoffs(database: typeof db, apply = false) {
  return database.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('reprocess-t1-t2-handoffs'))`);
    const eligible = sql`
      ${conversations.tier} in ('T1', 'T2') and ${conversations.requiresHuman} = true
      and ${conversations.ticketStatus} not in ('resolved', 'closed')
      and ${conversations.source} <> 'freshdesk' and ${conversations.freshdeskImportUpdatedAt} is null
      and ${conversations.escalationReason} is distinct from 'Staff took over'
      and ${messages.dedupeKey} not like 'freshdesk-import:%' and ${messages.direction} = 'incoming'
      and (
        (${conversations.legacyTicketId} is null and ${conversations.threadId} not like 'local:%')
        or (${conversations.source} = 'webapp' and ${tickets.id} is not null
          and ${tickets.kind} <> 'refund' and ${conversations.kind} <> 'refund'
          and ${conversations.email} like '%@%')
      )
      and not exists (select 1 from support_email_jobs uncertain
        where uncertain.conversation_id = ${conversations.id} and uncertain.status in ('unknown', 'processing'))`;
    const select = (id?: string) => tx.select({ id: conversations.id, ticketNumber: conversations.ticketNumber, messageId: messages.id })
      .from(conversations).innerJoin(messages, and(eq(messages.id, conversations.latestMessageId), eq(messages.conversationId, conversations.id)))
      .leftJoin(tickets, eq(tickets.id, conversations.legacyTicketId))
      .where(and(eligible, id ? eq(conversations.id, id) : undefined));
    const candidates = await select();
    const ticketNumbers: number[] = [];
    let cancelledJobs = 0;
    let insertedPrepareJobs = 0;
    let resetPrepareJobs = 0;
    for (const candidate of candidates) {
      if (!apply) { ticketNumbers.push(candidate.ticketNumber); continue; }
      // Same lock as intake/staff/worker, then recheck eligibility after waiting.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`conversation:${candidate.id}`}))`);
      const [current] = await select(candidate.id);
      if (!current) continue;
      const now = new Date();
      await tx.update(conversations).set({ owner: "agent", requiresHuman: false, status: "queued", escalationReason: null, updatedAt: now }).where(eq(conversations.id, current.id));
      const cancelled = await tx.update(jobs).set({ status: "cancelled", error: "reprocess_t1_t2" }).where(and(eq(jobs.conversationId, current.id), inArray(jobs.stage, ["escalate", "human_note"]), inArray(jobs.status, ["queued", "blocked", "failed"]))).returning({ id: jobs.id });
      cancelledJobs += cancelled.length;
      const inserted = await tx.insert(jobs).values({ id: crypto.randomUUID(), conversationId: current.id, messageId: current.messageId, stage: "prepare", sendAfter: now, runAt: now }).onConflictDoNothing().returning({ id: jobs.id });
      insertedPrepareJobs += inserted.length;
      if (!inserted.length) {
        const reset = await tx.update(jobs).set({ status: "queued", attempts: 0, draft: null, error: null, startedAt: null, runAt: now, sendAfter: now }).where(and(eq(jobs.messageId, current.messageId), eq(jobs.stage, "prepare"))).returning({ id: jobs.id });
        resetPrepareJobs += reset.length;
      }
      ticketNumbers.push(current.ticketNumber);
    }
    return { apply, selected: ticketNumbers.length, cancelledJobs, insertedPrepareJobs, resetPrepareJobs, ticketNumbers: ticketNumbers.sort((a, b) => a - b) };
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be explicitly provided");
  reprocessT1T2Handoffs(db, process.argv.includes("--apply"))
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => rawSql.end());
}
