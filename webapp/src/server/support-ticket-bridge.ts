import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { supportEmailConversations as conversations, supportEmailMessages as messages, supportEmailJobs as jobs, users, type Ticket } from "@/db/schema";
import { deterministicTier, requiredHumanHandoff, responseDueAt } from "./support-email-contract";
import { readSupportEmailTone } from "./support-email-tone";

/** Idempotent bridge preserves legacy app/refund references without requiring new accounts. */
export async function bridgeAppTicket(ticket: Ticket, description?: string, historical = false) {
  const tone = historical ? {minDelayMinutes:15,maxDelayMinutes:45} : await readSupportEmailTone();
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`legacy-ticket:${ticket.id}`}))`);
    const existing = await tx.query.supportEmailConversations.findFirst({ where: eq(conversations.legacyTicketId, ticket.id) });
    if (existing) return existing;
    const byFreshdesk = ticket.freshdeskId ? await tx.query.supportEmailConversations.findFirst({ where: eq(conversations.freshdeskId, ticket.freshdeskId) }) : null;
    if (byFreshdesk) {
      const [row] = await tx.update(conversations).set({ legacyTicketId: ticket.id, kind: ticket.kind }).where(eq(conversations.id, byFreshdesk.id)).returning(); return row;
    }
    const user = await tx.query.users.findFirst({ where: eq(users.id, ticket.userId) });
    const email = ticket.email.includes("@") ? ticket.email.toLowerCase() : user?.email?.toLowerCase() ?? "";
    const body = description?.trim() || ticket.lastMessage || ticket.subject;
    const tier = deterministicTier(`${ticket.subject}\n${body}`);
    const reason = requiredHumanHandoff(`${ticket.subject}\n${body}`);
    const human = historical || tier === "T3" || !!reason || ticket.kind === "refund" || !email;
    const id = crypto.randomUUID(); const messageId = crypto.randomUUID();
    const legacyNumber = /^T-(\d+)$/.exec(ticket.id)?.[1];
    const now = new Date();
    const [c] = await tx.insert(conversations).values({ id, ...(legacyNumber ? { ticketNumber: Number(legacyNumber) } : {}), mailboxId: "local", threadId: `local:${id}`, email, name: user?.fullName || user?.name || "", subject: ticket.subject, kind: ticket.kind, source: "webapp", legacyTicketId: ticket.id, freshdeskId: ticket.freshdeskId, tier, owner: human ? "human" : "agent", requiresHuman: human && !["resolved", "closed"].includes(ticket.status), ticketStatus: ["resolved", "closed", "pending", "on_hold"].includes(ticket.status) ? ticket.status : ticket.status === "in_review" ? "on_hold" : historical ? "open" : "new", escalationReason: reason || (human ? "Staff response required" : null), latestMessageId: messageId, createdAt: ticket.createdAt, updatedAt: now }).returning();
    await tx.insert(messages).values({ id: messageId, conversationId: id, dedupeKey: `legacy-ticket:${ticket.id}`, providerMessageId: ticket.id, direction: historical ? "note" : "incoming", subject: ticket.subject, text: historical ? `Imported app ticket summary (original customer description is not stored in this legacy mirror):\n${body}` : body, receivedAt: ticket.createdAt });
    if (!historical && !human) await tx.insert(jobs).values({ id: crypto.randomUUID(), conversationId: id, messageId, stage: "prepare", sendAfter: responseDueAt(now, Math.random(), { minDelay: tone.minDelayMinutes, maxDelay: tone.maxDelayMinutes }) });
    return c;
  });
}
export async function customerTicketHistory(userId: string) {
  const rows = await db.select({ id: messages.id, text: messages.text, direction: messages.direction, receivedAt: messages.receivedAt, ticketNumber: conversations.ticketNumber, legacyTicketId: conversations.legacyTicketId, ticketStatus: conversations.ticketStatus }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id)).innerJoin(users, eq(users.id, userId)).where(and(sql`${conversations.legacyTicketId} in (select id from tickets where user_id=${userId})`, sql`${messages.direction} in ('incoming','outgoing')`)).orderBy(asc(messages.receivedAt));
  return rows;
}
