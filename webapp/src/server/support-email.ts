import { and, asc, count, desc, eq, ilike, inArray, lt, lte, ne, not, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, adminUsers, tickets, supportTicketAttachments, supportEmailConversations as conversations, supportEmailMessages as messages, supportEmailJobs as jobs } from "@/db/schema";
import { buildTrackingUrl } from "@/lib/tracking";
import { refundFormPath } from "./refund-form-email";
import { EmailReplyRejected, generateSupportEmail, type SupportEmailContext } from "./support-email-ai";
import { isAutomatedEmail, supportEmailOrderTiming, canDeliverEmail, deliverSupportEmail, deterministicTier, requiredHumanHandoff, messageDedupeKey, outboundEmailPayload, responseDueAt, supportEmailConfig, type EmailInbound, freshdeskEmailEventSchema } from "./support-email-contract";
import { readSupportEmailTone, voicePreferences } from "./support-email-tone";
import { internalSupportEnabled, type TicketStatus } from "@/lib/support-tickets";
import { publishedKnowledge } from "./support-knowledge";
import { pushEmailToFreshdesk } from "./support-email-freshdesk";
import type { z } from "zod";

type Conversation = typeof conversations.$inferSelect;
type Message = typeof messages.$inferSelect;
type Job = typeof jobs.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const lockKey = (c: Pick<Conversation, "mailboxId" | "threadId">) => `${c.mailboxId}\n${c.threadId}`;
const lock = (tx: Transaction, key: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);

export type EmailReceipt = { accepted: boolean; deduped?: boolean; ignored?: boolean; reason?: string; conversationId?: string; messageId?: string; tier?: string };
export async function receiveSupportEmail(input: EmailInbound): Promise<EmailReceipt> {
  if (isAutomatedEmail(input)) return { accepted: true, ignored: true, reason: "automated_sender" };
  const now = new Date();
  const tone = await readSupportEmailTone();
  if (new Date(input.receivedAt).getTime() > now.getTime() + 5 * 60_000) throw Response.json({ error: "received_at_in_future" }, { status: 400 });
  const dedupeKey = messageDedupeKey(input.mailboxId, input.messageId);
  return db.transaction(async tx => {
    await lock(tx, lockKey(input));
    const existing = await tx.query.supportEmailMessages.findFirst({ where: eq(messages.dedupeKey, dedupeKey) });
    if (existing) {
      const c = await tx.query.supportEmailConversations.findFirst({ where: eq(conversations.id, existing.conversationId) });
      if (c?.email !== input.from.email || c.threadId !== input.threadId || existing.text !== input.text || existing.subject !== input.subject) throw Response.json({ error: "message_id_conflict" }, { status: 409 });
      return { accepted: true, deduped: true, conversationId: existing.conversationId, messageId: existing.id };
    }
    // Rebind an imported/local thread only on one exact sender+normalized-subject match.
    // Multiple matches remain separate tickets rather than guessing across conversations.
    const normalizeSubject=(value:string)=>value.replace(/^(?:(?:re|fw|fwd):\s*)+/gi,"").trim().toLowerCase();
    const native=await tx.query.supportEmailConversations.findFirst({where:and(eq(conversations.mailboxId,input.mailboxId),eq(conversations.threadId,input.threadId))});
    if(!native) {
      await lock(tx, `rebind:${input.from.email}:${normalizeSubject(input.subject)}`);
      const candidates=await tx.query.supportEmailConversations.findMany({where:and(eq(conversations.email,input.from.email),sql`${conversations.threadId} like 'local:%'`,sql`lower(trim(regexp_replace(${conversations.subject},'^(?:(?:re|fw|fwd):[[:space:]]*)+','','i'))) = ${normalizeSubject(input.subject)}`),limit:2});
      if(candidates.length===1) {
        await lock(tx, `conversation:${candidates[0].id}`);
        await tx.update(conversations).set({mailboxId:input.mailboxId,threadId:input.threadId}).where(and(eq(conversations.id,candidates[0].id),sql`${conversations.threadId} like 'local:%'`));
      }
    }
    const tier = deterministicTier(`${input.subject}\n${input.text}`);
    await tx.insert(conversations).values({ id: crypto.randomUUID(), mailboxId: input.mailboxId, threadId: input.threadId, email: input.from.email, name: input.from.name, subject: input.subject, tier }).onConflictDoNothing({ target: [conversations.mailboxId, conversations.threadId] });
    const found = (await tx.query.supportEmailConversations.findFirst({ where: and(eq(conversations.mailboxId, input.mailboxId), eq(conversations.threadId, input.threadId)) }))!;
    await lock(tx, `conversation:${found.id}`);
    const c = (await tx.query.supportEmailConversations.findFirst({ where: eq(conversations.id, found.id) }))!;
    if (c.email !== input.from.email) throw Response.json({ error: "thread_sender_mismatch" }, { status: 409 });
    const [m] = await tx.insert(messages).values({ id: crypto.randomUUID(), conversationId: c.id, dedupeKey, providerMessageId: input.messageId, rfcMessageId: input.rfcMessageId, direction: "incoming", subject: input.subject, text: input.text, references: input.references, attachments: input.attachments, receivedAt: new Date(input.receivedAt) }).returning();
    const previous = c.latestMessageId ? await tx.query.supportEmailMessages.findFirst({ where: eq(messages.id, c.latestMessageId) }) : null;
    if (previous && previous.receivedAt > m.receivedAt) return { accepted: true, ignored: true, reason: "older_message_saved", conversationId: c.id, messageId: m.id };
    await tx.update(jobs).set({ status: "cancelled", error: "new_customer_message" }).where(and(eq(jobs.conversationId, c.id), inArray(jobs.stage, ["prepare", "send"]), inArray(jobs.status, ["queued", "blocked", "review", "failed"])));
    const uncertain = await tx.query.supportEmailJobs.findFirst({ where: and(eq(jobs.conversationId, c.id), eq(jobs.status, "unknown")) });
    const handoff = requiredHumanHandoff(`${input.subject}\n${input.text}`);
    const human = tier === "T3" || c.owner === "human" || !!uncertain;
    await tx.update(conversations).set({ latestMessageId: m.id, subject: input.subject, tier, requiresHuman: human, ticketStatus: c.latestMessageId ? "open" : "new", owner: human ? "human" : "agent", status: uncertain ? "delivery_unknown" : human ? "awaiting_human" : "queued", escalationReason: uncertain ? "Reconcile the previous uncertain delivery before responding" : tier === "T3" ? handoff : c.owner === "human" ? c.escalationReason : null, updatedAt: now }).where(eq(conversations.id, c.id));
    await tx.insert(jobs).values({ id: crypto.randomUUID(), conversationId: c.id, messageId: m.id, stage: human ? (c.freshdeskId ? "human_note" : "escalate") : "prepare", runAt: now, sendAfter: human || c.firstRepliedAt ? now : responseDueAt(now, Math.random(), { minDelay: tone.minDelayMinutes, maxDelay: tone.maxDelayMinutes }) });
    return { accepted: true, deduped: false, conversationId: c.id, messageId: m.id, tier };
  });
}

export async function supportEmailContext(c: Conversation, incoming: Message): Promise<SupportEmailContext> {
  const today = new Date().toISOString().slice(0, 10);
  const [history, purchaseRows] = await Promise.all([
    db.query.supportEmailMessages.findMany({ where: and(eq(messages.conversationId, c.id), inArray(messages.direction, ["incoming", "outgoing"])), orderBy: [desc(messages.receivedAt), desc(messages.id)], limit: 20 }),
    db.query.orders.findMany({ where: sql`lower(${orders.email}) = ${c.email}`, orderBy: [desc(orders.placedAt)], limit: 21, columns: { id: true, number: true, buygoodsOrderId: true, konnektiveOrderId: true, productName: true, status: true, shippingTrackingId: true, shippingStatus: true, fulfilledAt: true, trackingSteps: true, source: true, total: true, currency: true, placedAt: true } }),
  ]);
  const requestedOrder = purchaseRows.find(o => [o.id, o.number, o.buygoodsOrderId, o.konnektiveOrderId].some(id => id && id.length >= 4 && new RegExp(`(?<![a-z0-9])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "i").test(`${incoming.subject}\n${incoming.text}`)));
  // An explicitly different order must not silently fall back to the sender's only order.
  const claimedText = /(?:order(?:\s+(?:number|id))?|pedido|commande|orden)\s*[:#]?\s*([a-z0-9-]{4,})/i.exec(`${incoming.subject}\n${incoming.text}`)?.[1];
  const claimedOrder = claimedText && (/\d/.test(claimedText) || /^[A-Z0-9-]{5,}$/.test(claimedText)) ? claimedText : null;
  const apparentId = /\b(?=[a-z0-9-]{6,}\b)(?=[a-z0-9-]*\d{2})[a-z0-9-]*[a-z][a-z0-9-]*\b/i.test(incoming.text);
  const selected = requestedOrder ?? (!claimedOrder && !apparentId && purchaseRows.length === 1 ? purchaseRows[0] : null);
  const publicUrl = process.env.SUPPORT_EMAIL_PUBLIC_APP_URL || "https://app.beneonature.com";
  const refundUrl = selected ? new URL(refundFormPath(selected.id), publicUrl).toString() : null;
  if (refundUrl && !refundUrl.startsWith("https://")) throw new Error("invalid_public_app_url");
  return {
    today, customerEmail: c.email, subject: incoming.subject, incoming: incoming.text, hasAttachments: incoming.attachments.length > 0,
    history: history.reverse().map(m => ({ direction: m.direction, text: m.text.slice(0, 4000) })),
    orders: purchaseRows.map(o => ({ ...supportEmailOrderTiming(o.fulfilledAt, o.trackingSteps, today), number: o.buygoodsOrderId || o.konnektiveOrderId || o.number, product: o.productName, status: o.status, total: o.total, currency: o.currency, placedAt: o.placedAt.toISOString(), trackingCode: o.shippingTrackingId, shippingStatus: o.shippingStatus, fulfilledAt: o.fulfilledAt?.toISOString() ?? null, trackingEvents: o.trackingSteps, source: o.source, trackingUrl: o.shippingTrackingId ? buildTrackingUrl(o.shippingTrackingId) : null })),
    refundUrl, selectedOrderNumber: selected ? selected.buygoodsOrderId || selected.konnektiveOrderId || selected.number : null,
    knowledge: await publishedKnowledge("email"),
  };
}

export async function withConversationLock<T>(conversationId: string, fn: (tx: Transaction, c: Conversation) => Promise<T>) {
  return db.transaction(async tx => {
    // Provider thread IDs can change when a local/imported ticket is bound.
    // Serialize staff actions, delivery and intake on the immutable ticket ID.
    await lock(tx, `conversation:${conversationId}`);
    const current = await tx.query.supportEmailConversations.findFirst({ where: eq(conversations.id, conversationId) });
    if (!current) throw new Error("conversation_not_found");
    return fn(tx, current);
  });
}

async function blockBehindUncertainDelivery(tx: Transaction, job: Job) {
  const uncertain = await tx.query.supportEmailJobs.findFirst({ where: and(eq(jobs.conversationId, job.conversationId), eq(jobs.status, "unknown"), ne(jobs.id, job.id)) });
  if (!uncertain) return false;
  await tx.update(jobs).set({ status: "blocked", error: "reconcile_unknown_delivery_first", runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
  return true;
}

async function prepareJob(job: Job, c: Conversation, incoming: Message) {
  const context = await supportEmailContext(c, incoming);
  if (job.error?.startsWith("reply_rejected:") && job.draft) context.previousRejection = { reason: job.draft.reason, reply: job.draft.reply };
  const tone = await readSupportEmailTone();
  const draft = await generateSupportEmail(context, voicePreferences(tone));
  draft.needsHuman = draft.tier === "T3";
  return withConversationLock(c.id, async (tx, current) => {
    if (current.owner !== "agent" || current.latestMessageId !== incoming.id) {
      await tx.update(jobs).set({ status: "cancelled", error: "conversation_changed" }).where(eq(jobs.id, job.id));
      return;
    }
    const human = draft.tier === "T3";
    await tx.update(conversations).set({ tier: draft.tier, language: draft.language, requiresHuman: human, ticketStatus: human ? "open" : current.ticketStatus, owner: human ? "human" : "agent", status: human ? "awaiting_human" : "draft_ready", escalationReason: human ? draft.reason : null, updatedAt: new Date() }).where(eq(conversations.id, c.id));
    await tx.update(jobs).set({ draft, stage: human ? (current.freshdeskId ? "human_note" : "escalate") : "send", status: !human && !canDeliverEmail(current.email) ? "review" : "queued", runAt: human ? new Date() : job.sendAfter, attempts: 0, startedAt: null, error: null }).where(eq(jobs.id, job.id));
  });
}

async function recordOutgoing(tx: Transaction, c: Conversation, job: Job, incoming: Message, providerId: string) {
  await tx.insert(messages).values({ id: crypto.randomUUID(), conversationId: c.id, dedupeKey: `outgoing:${job.id}`, providerMessageId: providerId, direction: "outgoing", authorAdminId: job.actorAdminId, subject: incoming.subject, text: `${job.draft!.reply}\n\n${supportEmailConfig().signature}`, references: incoming.references, receivedAt: new Date() }).onConflictDoNothing({ target: messages.dedupeKey });
  await tx.update(jobs).set({ status: "succeeded", error: null }).where(eq(jobs.id, job.id));
  if (c.legacyTicketId) await tx.update(tickets).set({ status: job.replyStatus || "pending", lastMessage: job.draft!.reply }).where(eq(tickets.id, c.legacyTicketId));
  if (job.stage !== "manual_send" && job.draft?.needsHuman && c.owner === "human" && c.latestMessageId === job.messageId) {
    await tx.insert(jobs).values({ id: crypto.randomUUID(), conversationId: c.id, messageId: incoming.id, stage: "escalate", sendAfter: new Date() }).onConflictDoNothing();
  }
  await tx.update(conversations).set({ requiresHuman: job.stage === "manual_send" ? false : c.requiresHuman, ticketStatus: (job.stage === "manual_send" ? job.replyStatus || "pending" : "pending") as TicketStatus, status: c.owner === "agent" && c.latestMessageId === job.messageId ? "replied" : c.status === "delivery_unknown" ? "awaiting_human" : c.status, firstRepliedAt: c.firstRepliedAt ?? new Date(), updatedAt: new Date() }).where(eq(conversations.id, c.id));
}

async function deliverJob(job: Job, incoming: Message) {
  return withConversationLock(job.conversationId, async (tx, c) => {
    if (await blockBehindUncertainDelivery(tx, job)) return;
    const manual = job.stage === "manual_send";
    if (!manual && (c.tier === "T3" || c.requiresHuman)) {
      await tx.update(jobs).set({ status: "cancelled", error: "human_response_required" }).where(eq(jobs.id, job.id));
      return;
    }
    if (manual) {
      const actor = job.actorAdminId ? await tx.query.adminUsers.findFirst({ where: eq(adminUsers.id, job.actorAdminId) }) : null;
      if (!actor?.active || !["admin", "cs"].includes(actor.role)) {
        await tx.update(jobs).set({ status: "blocked", error: "staff_permission_revoked" }).where(eq(jobs.id, job.id)); return;
      }
    }
    if (c.owner !== (manual || job.draft?.needsHuman ? "human" : "agent") || c.latestMessageId !== incoming.id) {
      await tx.update(jobs).set({ status: "cancelled", error: "conversation_changed" }).where(eq(jobs.id, job.id));
      return;
    }
    if (!job.draft?.reply) throw new Error("draft_missing");
    if (c.threadId.startsWith("local:")) {
      await tx.update(jobs).set({ status: "blocked", error: "email_thread_required", runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
      return;
    }
    const payload = outboundEmailPayload({ requestId: job.id, conversationId: c.id, mailboxId: c.mailboxId, threadId: c.threadId, messageId: incoming.providerMessageId, rfcMessageId: incoming.rfcMessageId, references: incoming.references, email: c.email, subject: incoming.subject, text: `${job.draft.reply}\n\n${supportEmailConfig().signature}` });
    const result = await deliverSupportEmail(payload);
    if (result.status === "sent") {
      return recordOutgoing(tx, c, job, incoming, result.messageId);
    }
    await tx.update(jobs).set({ status: result.status, error: result.error, runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
    await tx.update(conversations).set({ status: result.status === "unknown" ? "delivery_unknown" : "delivery_blocked", updatedAt: new Date() }).where(eq(conversations.id, c.id));
  });
}

async function escalateJob(job: Job, incoming: Message) {
  return withConversationLock(job.conversationId, async (tx, c) => {
    if (await blockBehindUncertainDelivery(tx, job)) return;
    if (c.owner !== "human") {
      await tx.update(jobs).set({ status: "cancelled", error: "human_handoff_cancelled" }).where(eq(jobs.id, job.id));
      return;
    }
    if (internalSupportEnabled() || process.env.SUPPORT_EMAIL_LEGACY_FRESHDESK_HANDOFF !== "true") {
      await tx.update(conversations).set({ owner: "human", requiresHuman: true, ticketStatus: ["resolved", "closed"].includes(c.ticketStatus) ? c.ticketStatus : "open", status: "awaiting_human", updatedAt: new Date() }).where(eq(conversations.id, c.id));
      await tx.update(jobs).set({ status: "succeeded", error: null }).where(eq(jobs.id, job.id));
      return;
    }
    // The same pilot gate applies to Freshdesk because its automations may email requesters.
    if (!canDeliverEmail(c.email)) {
      await tx.update(jobs).set({ status: "blocked", error: "human_sync_disabled_for_recipient", runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
      return;
    }
    const history = c.freshdeskId ? [incoming] : await tx.query.supportEmailMessages.findMany({ where: eq(messages.conversationId, c.id), orderBy: [asc(messages.createdAt)], limit: 50 });
    const description = `Conversation: ${c.id}\nMailbox: ${c.mailboxId}\nThread: ${c.threadId}\nTier: ${c.tier}\nReason: ${c.escalationReason || "Human support requested"}\n\n${history.map(m => `[${m.direction} ${m.receivedAt.toISOString()}]\n${m.text}\n${m.attachments.length ? `Attachments (ask n8n for files): ${m.attachments.map(a => `${a.name} (${a.id})`).join(", ")}` : ""}`).join("\n\n")}`;
    const result = await pushEmailToFreshdesk({ freshdeskId: c.freshdeskId, email: c.email, name: c.name, subject: c.subject, tier: c.tier, conversationId: c.id, description });
    if (result.status === "synced") {
      await tx.update(conversations).set({ owner: "human", status: "human", freshdeskId: result.freshdeskId, updatedAt: new Date() }).where(eq(conversations.id, c.id));
      await tx.update(jobs).set({ status: "succeeded", error: null }).where(eq(jobs.id, job.id));
    } else await tx.update(jobs).set({ status: result.status, error: result.error, runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
  });
}

export async function runSupportEmailJobs(limit = 3) {
  const mode = supportEmailConfig().mode;
  if (mode === "off") return { mode, processed: 0 };
  // A crash after starting an external write is uncertain. Never resend automatically.
  await db.update(jobs).set({ status: "unknown", error: "worker_interrupted_during_external_write" }).where(and(eq(jobs.status, "processing"), inArray(jobs.stage, ["send", "manual_send", "escalate", "human_note"]), lt(jobs.startedAt, new Date(Date.now() - 5 * 60_000))));
  await db.update(jobs).set({ status: "queued", startedAt: null }).where(and(eq(jobs.status, "processing"), eq(jobs.stage, "prepare"), lt(jobs.startedAt, new Date(Date.now() - 5 * 60_000))));
  const allowed = supportEmailConfig().allowedRecipients;
  const recipientAllowed = allowed.length ? sql`exists(select 1 from support_email_conversations recipient where recipient.id=${jobs.conversationId} and lower(recipient.email) in (${sql.join(allowed.map(email=>sql`${email}`),sql`, `)}))` : sql`false`;
  // Pilot restricts external writes only. Every inbound email still gets a draft for staff review.
  const pilotRecipient = mode !== "pilot" ? undefined : sql`(${jobs.stage} = 'prepare' or ${recipientAllowed})`;
  if(pilotRecipient) await db.update(jobs).set({status:"blocked",error:"pilot_recipient_not_allowed",runAt:new Date(Date.now()+5*60_000)}).where(and(inArray(jobs.status,["queued","blocked"]),lte(jobs.runAt,new Date()),not(pilotRecipient)));
  const due = await db.query.supportEmailJobs.findMany({ where: and(inArray(jobs.status, ["queued", "blocked"]), lte(jobs.runAt, new Date()),pilotRecipient), orderBy: mode === "pilot" ? [sql`case when ${recipientAllowed} then 0 else 1 end`, asc(jobs.runAt)] : [asc(jobs.runAt)], limit: Math.min(10, Math.max(1, limit)) });
  let processed = 0;
  const deadline = Date.now() + 45_000;
  for (const candidate of due) {
    if (Date.now() >= deadline || (processed > 0 && Date.now() + 30_000 > deadline)) break;
    const [job] = await db.update(jobs).set({ status: "processing", startedAt: new Date(), attempts: sql`${jobs.attempts} + 1` }).where(and(eq(jobs.id, candidate.id), eq(jobs.status, candidate.status))).returning();
    if (!job) continue;
    processed++;
    try {
      const [c, incoming] = await Promise.all([db.query.supportEmailConversations.findFirst({ where: eq(conversations.id, job.conversationId) }), db.query.supportEmailMessages.findFirst({ where: eq(messages.id, job.messageId) })]);
      if (!c || !incoming) throw new Error("missing_job_context");
      if (mode === "pilot" && job.stage !== "prepare" && !canDeliverEmail(c.email)) {
        await db.update(jobs).set({ status: "blocked", error: "pilot_recipient_not_allowed", runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
        continue;
      }
      const uncertain = await db.query.supportEmailJobs.findFirst({ where: and(eq(jobs.conversationId, c.id), eq(jobs.status, "unknown"), ne(jobs.id, job.id)) });
      if (uncertain) {
        await db.update(jobs).set({ status: "blocked", error: "reconcile_unknown_delivery_first", runAt: new Date(Date.now() + 5 * 60_000) }).where(eq(jobs.id, job.id));
        continue;
      }
      if (job.stage === "prepare") await prepareJob(job, c, incoming);
      else if (job.stage === "send" || job.stage === "manual_send") await deliverJob(job, incoming);
      else await escalateJob(job, incoming);
    } catch (error) {
      const message = error instanceof Error ? error.message : "job_failed";
      const configuration = /not_configured|unsupported_llm_provider|invalid_public_app_url/.test(message);
      if (job.stage !== "prepare") {
        await db.update(jobs).set({ status: "unknown", error: "external_write_not_confirmed" }).where(eq(jobs.id, job.id));
      } else {
        const rejection = error instanceof EmailReplyRejected ? error : null;
        await withConversationLock(job.conversationId, async (tx, c) => {
          if (c.latestMessageId !== job.messageId || c.owner !== "agent") {
            await tx.update(jobs).set({ status: "cancelled", error: "conversation_changed" }).where(eq(jobs.id, job.id));
            return;
          }
          const exhausted = job.attempts >= 3 && !configuration;
          const failure = rejection ? `reply_rejected: ${rejection.reason}` : configuration ? "llm_configuration_missing" : "generation_failed";
          await tx.update(jobs).set({
            ...(rejection ? { draft: rejection.draft } : {}),
            stage: exhausted && rejection ? "send" : "prepare",
            status: configuration ? "blocked" : exhausted ? rejection ? "review" : "failed" : "queued",
            error: failure, startedAt: null, runAt: new Date(Date.now() + (rejection ? 60_000 : 5 * 60_000)),
          }).where(eq(jobs.id, job.id));
          if (exhausted) await tx.update(conversations).set({
            requiresHuman: false, status: rejection ? "draft_needs_review" : "generation_failed",
            escalationReason: rejection ? rejection.reason : null, updatedAt: new Date(),
          }).where(eq(conversations.id, c.id));
        });
      }
    }
  }
  return { mode, processed };
}

export async function receiveFreshdeskEmailEvent(input: z.infer<typeof freshdeskEmailEventSchema>) {
  if(internalSupportEnabled()) return {accepted:true,ignored:true,reason:"legacy_events_disabled"};
  const c = await db.query.supportEmailConversations.findFirst({ where: input.conversationId ? eq(conversations.id, input.conversationId) : eq(conversations.freshdeskId, input.freshdeskId) });
  if (!c || (c.freshdeskId && c.freshdeskId !== input.freshdeskId)) throw Response.json({ error: "conversation_not_found" }, { status: 404 });
  return withConversationLock(c.id, async (tx, current) => {
    const dedupeKey = `freshdesk-event:${messageDedupeKey(String(input.freshdeskId), input.eventId)}`;
    const existing = await tx.query.supportEmailMessages.findFirst({ where: eq(messages.dedupeKey, dedupeKey) });
    if (existing) return { accepted: true, deduped: true };
    const lastEvent = await tx.query.supportEmailMessages.findFirst({ where: and(eq(messages.conversationId, current.id), eq(messages.direction, "human")), orderBy: [desc(messages.receivedAt)] });
    await tx.insert(messages).values({ id: crypto.randomUUID(), conversationId: current.id, dedupeKey, providerMessageId: input.messageId || input.eventId, direction: "human", subject: current.subject, text: input.text || input.event, receivedAt: new Date(input.occurredAt) });
    if (lastEvent && lastEvent.receivedAt > new Date(input.occurredAt)) return { accepted: true, ignored: true, reason: "older_human_event_saved" };
    await tx.update(conversations).set({ owner: "human", requiresHuman: input.event !== "human.replied" && input.event !== "ticket.resolved", ticketStatus: input.event === "ticket.resolved" ? "resolved" : input.event === "human.replied" ? "pending" : "open", freshdeskId: input.freshdeskId, status: input.event === "ticket.resolved" ? "resolved" : "human", firstRepliedAt: input.event === "human.replied" ? current.firstRepliedAt ?? new Date(input.occurredAt) : current.firstRepliedAt, updatedAt: new Date() }).where(eq(conversations.id, current.id));
    if (!current.freshdeskId) await tx.update(jobs).set({ status: "succeeded", error: null }).where(and(eq(jobs.conversationId, current.id), eq(jobs.stage, "escalate"), eq(jobs.status, "unknown")));
    await tx.update(jobs).set({ status: "cancelled", error: "human_took_over" }).where(and(eq(jobs.conversationId, current.id), inArray(jobs.stage, ["prepare", "send"]), inArray(jobs.status, ["queued", "review", "blocked", "failed"])));
    return { accepted: true, deduped: false };
  });
}

export async function listSupportEmails(opts: { limit?: number; offset?: number; q?: string; tier?: string; owner?: string; status?: string; requiresHuman?: boolean; source?: string; kind?: string; excludeStatus?: string[]; orderBy?: string; direction?: string }) {
  const limit = Math.min(100, Math.max(1, opts.limit ?? 10));
  const offset = Math.max(0, opts.offset ?? 0);
  const where = and(opts.excludeStatus?.length ? sql`${conversations.ticketStatus} not in (${sql.join(opts.excludeStatus.map(s=>sql`${s.toLowerCase().replaceAll(" ","_")}`),sql`, `)})` : undefined, opts.status ? eq(conversations.ticketStatus, opts.status) : undefined, opts.requiresHuman ? eq(conversations.requiresHuman, true) : undefined, opts.source ? eq(conversations.source, opts.source) : undefined, opts.kind ? eq(conversations.kind, opts.kind) : undefined, opts.q ? or(ilike(conversations.email, `%${opts.q}%`), ilike(conversations.subject, `%${opts.q}%`), ilike(conversations.name, `%${opts.q}%`), sql`${conversations.ticketNumber}::text = ${opts.q.replace(/^#/, "")}`, sql`${conversations.freshdeskId}::text = ${opts.q.replace(/^#/, "")}`) : undefined, opts.tier ? eq(conversations.tier, opts.tier) : undefined, opts.owner ? eq(conversations.owner, opts.owner) : undefined);
  const order = opts.orderBy === "created" ? conversations.createdAt : conversations.updatedAt;
  const sort = opts.direction === "asc" ? asc : desc;
  const [rows, totals] = await Promise.all([db.select().from(conversations).where(where).orderBy(sort(order), sort(conversations.id)).limit(limit).offset(offset), db.select({ n: count() }).from(conversations).where(where)]);
  return { conversations: rows, total: totals[0].n, offset, limit, hasMore: offset + rows.length < totals[0].n, config: { ...supportEmailReadiness(), ...await readSupportEmailTone() } };
}

export function supportEmailReadiness() {
  const config = supportEmailConfig();
  return {
    backend: internalSupportEnabled() ? "internal" : "freshdesk", handoffBackend: internalSupportEnabled() || process.env.SUPPORT_EMAIL_LEGACY_FRESHDESK_HANDOFF !== "true" ? "internal" : "freshdesk",
    mode: config.mode, provider: config.provider, model: config.model, minDelay: config.minDelay, maxDelay: config.maxDelay,
    inboundConfigured: !!process.env.SUPPORT_EMAIL_INBOUND_API_KEY,
    outboundConfigured: !!(process.env.SUPPORT_EMAIL_OUTBOUND_WEBHOOK_URL && process.env.SUPPORT_EMAIL_OUTBOUND_API_KEY),
    llmConfigured: !!config.model && (config.provider === "openai" ? !!process.env.OPENAI_API_KEY : config.provider === "anthropic" && !!process.env.ANTHROPIC_API_KEY),
    freshdeskConfigured: !!(process.env.FRESHDESK_DOMAIN && process.env.FRESHDESK_API_KEY && Number(process.env.SUPPORT_EMAIL_FRESHDESK_GROUP_ID) > 0),
    humanWebhookConfigured: !!process.env.SUPPORT_EMAIL_FRESHDESK_WEBHOOK_API_KEY,
    jobConfigured: !!process.env.SUPPORT_EMAIL_JOB_KEY,
    pilotRecipientsConfigured: config.allowedRecipients.length > 0,
  };
}

export async function supportEmailDetails(id: string, before?: string) {
  const c = await db.query.supportEmailConversations.findFirst({ where: eq(conversations.id, id) });
  if (!c) throw Response.json({ error: "not_found" }, { status: 404 });
  const anchor = before ? await db.query.supportEmailMessages.findFirst({where:and(eq(messages.id,before),eq(messages.conversationId,id))}) : null;
  if(before && !anchor) throw Response.json({error:"invalid_history_cursor"},{status:400});
  const [historyRows, queue] = await Promise.all([db.query.supportEmailMessages.findMany({ where: and(eq(messages.conversationId, id), anchor ? or(lt(messages.receivedAt,anchor.receivedAt),and(eq(messages.receivedAt,anchor.receivedAt),lt(messages.id,anchor.id))) : undefined), orderBy: [desc(messages.receivedAt), desc(messages.id)], limit: 101 }), db.query.supportEmailJobs.findMany({ where: eq(jobs.conversationId, id), orderBy: [desc(jobs.createdAt)], limit: 20 })]);
  const history=historyRows.slice(0,100);
  const storedAttachments = history.length ? await db.select({ id: supportTicketAttachments.id, messageId: supportTicketAttachments.messageId, name: supportTicketAttachments.filename }).from(supportTicketAttachments).where(inArray(supportTicketAttachments.messageId, history.map(m=>m.id))) : [];
  const latest = c.latestMessageId ? await db.query.supportEmailMessages.findFirst({ where: eq(messages.id, c.latestMessageId) }) : null;
  const context = latest ? await supportEmailContext(c, latest) : null;
  const staff = await db.select({ id: adminUsers.id, name: adminUsers.name, email: adminUsers.email }).from(adminUsers).where(and(eq(adminUsers.active, true), inArray(adminUsers.role, ["admin", "cs"])));
  return { conversation: c, hasMoreMessages: historyRows.length > 100, messages: history.reverse().map(m=>({...m, attachments: [...m.attachments, ...storedAttachments.filter(a=>a.messageId===m.id).map(a=>({id:a.id,name:a.name,local:true}))]})), jobs: queue, orders: context?.orders ?? [], staff, config: supportEmailReadiness(), canDeliver: canDeliverEmail(c.email) && !c.threadId.startsWith("local:") };
}

export async function supportEmailAction(id: string, action: "takeover" | "resume" | "approve" | "retry" | "confirm_sent" | "confirm_not_sent" | "confirm_synced", jobId?: string, providerMessageId?: string, confirmedFreshdeskId?: number) {
  return withConversationLock(id, async (tx, c) => {
    const now = new Date();
    if (action === "takeover") {
      await tx.update(conversations).set({ owner: "human", requiresHuman: true, ticketStatus: "open", status: "awaiting_human", escalationReason: "Staff took over", updatedAt: now }).where(eq(conversations.id, id));
      await tx.update(jobs).set({ status: "cancelled", error: "human_took_over" }).where(and(eq(jobs.conversationId, id), inArray(jobs.stage, ["prepare", "send"]), inArray(jobs.status, ["queued", "review", "blocked", "failed"])));
      if (c.latestMessageId) await tx.insert(jobs).values({ id: crypto.randomUUID(), conversationId: id, messageId: c.latestMessageId, stage: "escalate", sendAfter: now }).onConflictDoNothing();
    } else if (action === "resume") {
      if (c.tier === "T3") throw Response.json({ error: "T3_requires_human_response" }, { status: 409 });
      const uncertain = await tx.query.supportEmailJobs.findFirst({ where: and(eq(jobs.conversationId, id), eq(jobs.status, "unknown")) });
      if (uncertain) throw Response.json({ error: "reconcile_unknown_delivery_first" }, { status: 409 });
      await tx.update(conversations).set({ owner: "agent", requiresHuman: false, status: "queued", escalationReason: null, updatedAt: now }).where(eq(conversations.id, id));
      // Resume takes effect for the next inbound email; old drafts stay cancelled.
    } else {
      const job = jobId ? await tx.query.supportEmailJobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.conversationId, id)) }) : null;
      if (!job) throw Response.json({ error: "job_not_found" }, { status: 404 });
      if (action === "confirm_sent") {
        if (job.status !== "unknown" || !["send", "manual_send"].includes(job.stage) || !providerMessageId) throw Response.json({ error: "invalid_reconciliation" }, { status: 409 });
        const incoming = (await tx.query.supportEmailMessages.findFirst({ where: eq(messages.id, job.messageId) }))!;
        if (c.threadId.startsWith("local:")) throw Response.json({ error: "email_thread_required" }, { status: 409 });
        await recordOutgoing(tx, c, job, incoming, providerMessageId);
      } else if (action === "confirm_synced") {
        if (job.status !== "unknown" || !["escalate", "human_note"].includes(job.stage) || !Number.isSafeInteger(confirmedFreshdeskId) || !confirmedFreshdeskId || confirmedFreshdeskId <= 0 || (c.freshdeskId && c.freshdeskId !== confirmedFreshdeskId)) throw Response.json({ error: "invalid_reconciliation" }, { status: 409 });
        await tx.update(jobs).set({ status: "succeeded", error: null }).where(eq(jobs.id, job.id));
        await tx.update(conversations).set({ owner: "human", freshdeskId: confirmedFreshdeskId, status: c.status === "resolved" ? "resolved" : "human", updatedAt: now }).where(eq(conversations.id, id));
      } else {
        if ((action === "confirm_not_sent" && job.status !== "unknown") || (action === "approve" && job.status !== "review") || (action === "retry" && !["failed", "blocked"].includes(job.status))) throw Response.json({ error: "job_not_retryable" }, { status: 409 });
        if (["send", "manual_send"].includes(job.stage) && (c.owner !== (job.stage === "manual_send" || job.draft?.needsHuman ? "human" : "agent") || c.latestMessageId !== job.messageId)) {
          if (action !== "confirm_not_sent") throw Response.json({ error: "conversation_changed" }, { status: 409 });
          await tx.update(jobs).set({ status: "cancelled", error: "verified_not_sent_conversation_changed" }).where(eq(jobs.id, job.id));
          await tx.update(conversations).set({ status: c.owner === "human" ? "awaiting_human" : "queued", updatedAt: now }).where(eq(conversations.id, c.id));
          return { ok: true };
        }
        if (action === "approve" && (c.tier === "T3" || c.requiresHuman)) throw Response.json({error:"human_response_required"},{status:409});
        if (action === "approve" && !canDeliverEmail(c.email)) throw Response.json({ error: "enable_pilot_for_this_recipient_first" }, { status: 409 });
        await tx.update(jobs).set({ status: "queued", error: null, attempts: 0, startedAt: null, runAt: ["send", "manual_send"].includes(job.stage) && job.sendAfter > now ? job.sendAfter : now }).where(eq(jobs.id, job.id));
      }
    }
    return { ok: true };
  });
}
