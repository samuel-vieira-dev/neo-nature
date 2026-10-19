import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { adminActionLogs, adminUsers, supportEmailConversations as conversations, supportEmailMessages as messages, supportEmailJobs as jobs, tickets } from "@/db/schema";
import { canDeliverEmail } from "./support-email-contract";
import { withConversationLock } from "./support-email";
import { TICKET_STATUSES, TICKET_STATUS_LABELS } from "@/lib/support-tickets";
import type { AdminContext } from "./admin";

export const ticketActionInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), text: z.string().trim().min(1).max(6000), requestId: z.uuid(), expectedMessageId: z.string(), expectedUpdatedAt: z.iso.datetime({ offset: true }), status: z.enum(TICKET_STATUSES).default("pending") }).strict(),
  z.object({ action: z.literal("note"), text: z.string().trim().min(1).max(6000), requestId: z.uuid() }).strict(),
  z.object({ action: z.literal("status"), status: z.enum(TICKET_STATUSES), expectedUpdatedAt: z.iso.datetime({ offset: true }) }).strict(),
  z.object({ action: z.literal("assign"), adminId: z.string().max(100).nullable() }).strict(),
]);
export async function ticketAction(id: string, data: z.infer<typeof ticketActionInput>, admin: AdminContext) {
  return withConversationLock(id, async (tx, c) => {
    const now = new Date();
    if (data.action === "reply") {
      const existing = await tx.query.supportEmailJobs.findFirst({ where: eq(jobs.id, data.requestId) });
      if (existing) {
        if (existing.conversationId !== id || existing.actorAdminId !== admin.id || existing.draft?.reply !== data.text || existing.replyStatus !== data.status) throw Response.json({ error: "request_id_conflict" }, { status: 409 });
        return { ok: true, jobId: existing.id, deduped: true };
      }
      if (!canDeliverEmail(c.email)) throw Response.json({ error: "pilot_recipient_not_allowed" }, { status: 403 });
      if (c.threadId.startsWith("local:")) throw Response.json({ error: "email_thread_required" }, { status: 409 });
      if (c.latestMessageId !== data.expectedMessageId || c.updatedAt.toISOString() !== new Date(data.expectedUpdatedAt).toISOString()) throw Response.json({ error: "ticket_changed_reload_before_replying" }, { status: 409 });
      const pending = await tx.query.supportEmailJobs.findFirst({ where: and(eq(jobs.conversationId, id), inArray(jobs.status, ["unknown", "processing"] )) });
      const manual = await tx.query.supportEmailJobs.findFirst({ where: and(eq(jobs.conversationId, id), eq(jobs.stage, "manual_send"), inArray(jobs.status, ["queued", "blocked", "failed"])) });
      if (pending || manual) throw Response.json({ error: "reconcile_or_finish_pending_reply_first" }, { status: 409 });
      if (!c.latestMessageId) throw Response.json({ error: "message_context_missing" }, { status: 409 });
      await tx.update(jobs).set({ status: "cancelled", error: "human_took_over" }).where(and(eq(jobs.conversationId, id), inArray(jobs.stage, ["prepare", "send", "escalate", "human_note"]), inArray(jobs.status, ["queued", "review", "blocked", "failed"])));
      await tx.insert(jobs).values({ id: data.requestId, conversationId: id, messageId: c.latestMessageId, stage: "manual_send", actorAdminId: admin.id, replyStatus: data.status, draft: { tier: c.tier as "T1"|"T2"|"T3", language: c.language, intent: "other", needsHuman: true, reason: "Staff reply", reply: data.text }, sendAfter: now, runAt: now });
      await tx.update(conversations).set({ owner: "human", assignedAdminId: c.assignedAdminId ?? admin.id, status: "human_reply_queued", updatedAt: now }).where(eq(conversations.id, id));
    } else if (data.action === "note") {
      const dedupeKey = `staff-note:${data.requestId}`;
      const existing = await tx.query.supportEmailMessages.findFirst({ where: eq(messages.dedupeKey, dedupeKey) });
      if (existing && (existing.conversationId !== id || existing.text !== data.text || existing.authorAdminId !== admin.id)) throw Response.json({ error: "request_id_conflict" }, { status: 409 });
      await tx.insert(messages).values({ id: crypto.randomUUID(), conversationId: id, providerMessageId: data.requestId, dedupeKey, authorAdminId: admin.id, direction: "note", subject: c.subject, text: data.text, receivedAt: now }).onConflictDoNothing({ target: messages.dedupeKey });
      if (existing) return { ok: true, deduped: true };
      await tx.update(conversations).set({ updatedAt: now }).where(eq(conversations.id, id));
    } else if (data.action === "status") {
      if (c.updatedAt.toISOString() !== new Date(data.expectedUpdatedAt).toISOString()) throw Response.json({ error: "ticket_changed_reload_before_saving" }, { status: 409 });
      if (["resolved", "closed"].includes(data.status)) {
        const uncertain = await tx.query.supportEmailJobs.findFirst({ where: and(eq(jobs.conversationId, id), inArray(jobs.status, ["unknown", "processing"])) });
        if (uncertain) throw Response.json({ error: "reconcile_pending_delivery_first" }, { status: 409 });
        await tx.update(jobs).set({ status: "cancelled", error: "ticket_closed_by_staff" }).where(and(eq(jobs.conversationId, id), inArray(jobs.status, ["queued", "review", "blocked", "failed"])));
      }
      await tx.update(conversations).set({ ticketStatus: data.status, requiresHuman: ["resolved", "closed", "pending"].includes(data.status) ? false : c.owner === "human" || c.tier === "T3", updatedAt: now }).where(eq(conversations.id, id));
      if (c.legacyTicketId) await tx.update(tickets).set({ status: data.status }).where(eq(tickets.id, c.legacyTicketId));
    } else {
      if (data.adminId) {
        const assignee = await tx.query.adminUsers.findFirst({ where: eq(adminUsers.id, data.adminId) });
        if (!assignee?.active || !["admin", "cs"].includes(assignee.role)) throw Response.json({ error: "invalid_assignee" }, { status: 400 });
      }
      await tx.update(conversations).set({ assignedAdminId: data.adminId, updatedAt: now }).where(eq(conversations.id, id));
    }
    if(data.action!=="note") await tx.insert(messages).values({id:crypto.randomUUID(),conversationId:id,dedupeKey:`ticket-activity:${crypto.randomUUID()}`,providerMessageId:crypto.randomUUID(),direction:"audit",authorAdminId:admin.id,subject:c.subject,text:data.action==="reply" ? "Human reply queued. Delivery confirmation is pending." : data.action==="status" ? `Status changed to ${TICKET_STATUS_LABELS[data.status]}.` : data.adminId ? "Ticket assigned to a staff member." : "Staff assignment cleared.",receivedAt:now});
    await tx.insert(adminActionLogs).values({ adminUserId: admin.id, action: `support-ticket.${data.action}`, metadata: { conversationId: id, ...(data.action === "reply" ? { requestId: data.requestId, status: data.status } : data.action === "status" ? { status: data.status } : data.action === "assign" ? { adminId: data.adminId } : { requestId: data.requestId }) } });
    return { ok: true, ...(data.action === "reply" ? { jobId: data.requestId } : {}) };
  });
}
